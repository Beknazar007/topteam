-- TopTeam: RPC недели 1 — залы и WOD

-- Короткий код приглашения без похожих символов (0/O, 1/I/L)
create or replace function public.gen_invite_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from gyms where invite_code = code);
  end loop;
  return code;
end $$;

-- Выдать бейдж (идемпотентно) + XP по редкости + пост в ленту. true, если выдан впервые.
create or replace function public.award_badge(p_user uuid, p_code text, p_gym uuid default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  b badges;
  v_xp int;
begin
  select * into b from badges where code = p_code and enabled;
  if not found then return false; end if;

  insert into user_badges (user_id, code) values (p_user, p_code) on conflict do nothing;
  if not found then return false; end if;

  select value into v_xp from game_config where key = 'xp.badge_r' || b.rarity;
  insert into xp_events (user_id, reason, amount, ref_id) values (p_user, 'badge', coalesce(v_xp, 0), p_code);
  update user_stats set xp = user_stats.xp + coalesce(v_xp, 0) where user_id = p_user;

  if p_gym is not null then
    insert into feed_items (gym_id, user_id, kind, payload)
    values (p_gym, p_user, 'badge', jsonb_build_object('code', b.code, 'name', b.name, 'emoji', b.emoji, 'rarity', b.rarity));
  end if;
  return true;
end $$;

-- Создать зал (создатель становится владельцем)
create or replace function public.create_gym(p_name text, p_city text default null) returns public.gyms
language plpgsql security definer set search_path = public as $$
declare
  g gyms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into gyms (name, city, invite_code) values (trim(p_name), nullif(trim(p_city), ''), gen_invite_code())
  returning * into g;
  insert into gym_members (gym_id, user_id, role) values (g.id, auth.uid(), 'owner');
  perform award_badge(auth.uid(), 'welcome', g.id);
  return g;
end $$;

-- Вступить в зал по коду
create or replace function public.join_gym(p_code text) returns public.gyms
language plpgsql security definer set search_path = public as $$
declare
  g gyms;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into g from gyms where invite_code = upper(trim(p_code));
  if not found then raise exception 'invalid_invite_code'; end if;
  insert into gym_members (gym_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  perform award_badge(auth.uid(), 'welcome', g.id);
  return g;
end $$;

-- Назначить роль (только владелец; себя понизить нельзя)
create or replace function public.set_member_role(p_gym uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_gym_role(p_gym, array['owner']) then raise exception 'forbidden'; end if;
  if p_user = auth.uid() then raise exception 'cannot_change_own_role'; end if;
  if p_role not in ('athlete','coach','owner') then raise exception 'invalid_role'; end if;
  update gym_members set role = p_role where gym_id = p_gym and user_id = p_user;
  if not found then raise exception 'not_a_member'; end if;
end $$;

-- Создать WOD (тренер/владелец) + уведомить зал.
-- Если указан бенчмарк — формат, тип результата и описание берутся из справочника, если не переданы.
create or replace function public.create_wod(
  p_gym uuid,
  p_date date,
  p_title text default null,
  p_format text default null,
  p_score_type text default null,
  p_description text default null,
  p_time_cap_sec int default null,
  p_benchmark_id int default null,
  p_exercise_id int default null,
  p_rep_max int default null,
  p_coach_note text default null
) returns public.wods
language plpgsql security definer set search_path = public as $$
declare
  bm benchmarks;
  w wods;
begin
  if not has_gym_role(p_gym, array['coach','owner']) then raise exception 'forbidden'; end if;
  if p_date < bishkek_today() - 7 or p_date > bishkek_today() + 14 then raise exception 'invalid_date'; end if;

  if p_benchmark_id is not null then
    select * into bm from benchmarks where id = p_benchmark_id;
    if not found then raise exception 'invalid_benchmark'; end if;
  end if;

  insert into wods (gym_id, wod_date, title, format, score_type, description, time_cap_sec,
                    benchmark_id, exercise_id, rep_max, coach_note, created_by)
  values (
    p_gym, p_date,
    coalesce(nullif(trim(p_title), ''), bm.name),
    coalesce(p_format, bm.format),
    coalesce(p_score_type, bm.score_type, case when p_format = 'max_weight' then 'weight' end),
    coalesce(nullif(trim(p_description), ''), bm.description, ''),
    coalesce(p_time_cap_sec, bm.time_cap_sec),
    p_benchmark_id, p_exercise_id, p_rep_max, nullif(trim(p_coach_note), ''), auth.uid()
  )
  returning * into w;

  -- уведомления о WOD на сегодня/будущее; прошлые даты (дозаполнение) не шлём
  if w.wod_date >= bishkek_today() then
    insert into notifications (user_id, kind, text)
    select m.user_id, 'new_wod',
           '🏋️ WOD ' || to_char(w.wod_date, 'DD.MM') || ': ' || w.title || E'\nЗаписывай результат в TopTeam!'
    from gym_members m join profiles p on p.id = m.user_id
    where m.gym_id = p_gym and m.user_id <> auth.uid() and p.notify;
  end if;

  return w;
end $$;

-- RPC доступны только вошедшим пользователям
revoke execute on function public.award_badge(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.create_gym(text, text) from public, anon;
revoke execute on function public.join_gym(text) from public, anon;
revoke execute on function public.set_member_role(uuid, uuid, text) from public, anon;
revoke execute on function public.create_wod(uuid, date, text, text, text, text, int, int, int, int, text) from public, anon;
grant execute on function public.create_gym(text, text) to authenticated;
grant execute on function public.join_gym(text) to authenticated;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.create_wod(uuid, date, text, text, text, text, int, int, int, int, text) to authenticated;
