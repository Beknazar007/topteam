-- TopTeam: этап 3 — 🔥, комментарии, удаление результата, соц-бейджи

-- Ключ для дедупликации уведомлений (напр. 'fire:<item>:<user>')
alter table public.notifications add column if not exists ref text;
create index if not exists notifications_ref_idx on public.notifications (user_id, kind, ref);

-- Бейджи: + «Поддержка» и «Любимчик зала»; уровень пересчитывается после начисления XP за бейджи
create or replace function public.check_badges(p_user uuid, p_gym uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s user_stats;
  got jsonb := '[]';
  c text;
  cond boolean;
begin
  select * into s from user_stats where user_id = p_user;
  for c, cond in
    select t.code, t.ok from (values
      ('first_result', s.workouts >= 1),
      ('workouts_10',  s.workouts >= 10),
      ('workouts_50',  s.workouts >= 50),
      ('workouts_100', s.workouts >= 100),
      ('first_pr',     s.pr_count >= 1),
      ('prs_10',       s.pr_count >= 10),
      ('streak_4',     s.streak_weeks >= 4),
      ('streak_12',    s.streak_weeks >= 12),
      ('streak_26',    s.streak_weeks >= 26),
      ('fires_given_50', s.fires_given >= 50),
      ('fires_got_100',  s.fires_received >= 100),
      ('double_pr', (select count(*) from results
                     where user_id = p_user and is_pr and bishkek_date(created_at) = bishkek_today()) >= 2),
      ('fran', exists (select 1 from results r join wods w on w.id = r.wod_id join benchmarks b on b.id = w.benchmark_id
                       where r.user_id = p_user and b.name = 'Fran')),
      ('murph', exists (select 1 from results r join wods w on w.id = r.wod_id join benchmarks b on b.id = w.benchmark_id
                        where r.user_id = p_user and b.name = 'Murph')),
      ('first_hero', exists (select 1 from results r join wods w on w.id = r.wod_id join benchmarks b on b.id = w.benchmark_id
                             where r.user_id = p_user and b.category = 'hero')),
      ('girls_5', (select count(distinct w.benchmark_id) from results r join wods w on w.id = r.wod_id
                   join benchmarks b on b.id = w.benchmark_id where r.user_id = p_user and b.category = 'girl') >= 5),
      ('rx_upgrade', (select count(*) from results where user_id = p_user and scale = 'Scaled'
                      and created_at < (select min(created_at) from results where user_id = p_user and scale = 'RX')) >= 5)
    ) as t(code, ok)
  loop
    if cond and award_badge(p_user, c, p_gym) then
      got := got || (select jsonb_build_object('code', code, 'name', name, 'emoji', emoji, 'rarity', rarity,
                                               'xp', cfg('xp.badge_r' || rarity))
                     from badges where code = c);
    end if;
  end loop;
  if jsonb_array_length(got) > 0 then
    update user_stats set level = level_for_xp(xp) where user_id = p_user;
  end if;
  return got;
end $$;

-- Начислить XP за соц-действие с дневным лимитом. true, если начислено.
create or replace function public.grant_daily_xp(p_user uuid, p_reason text, p_ref text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  amt int := cfg('xp.' || p_reason);
begin
  if (select count(*) from xp_events where user_id = p_user and reason = p_reason
      and bishkek_date(created_at) = bishkek_today()) >= cfg('xp.' || p_reason || '_daily_limit') then
    return false;
  end if;
  insert into xp_events (user_id, reason, amount, ref_id) values (p_user, p_reason, amt, p_ref);
  update user_stats set xp = xp + amt, level = level_for_xp(xp + amt) where user_id = p_user;
  return true;
end $$;

-- Подпись поста для уведомлений
create or replace function public.feed_item_label(f feed_items) returns text
language sql stable as $$
  select case f.kind
    when 'result' then 'результат «' || coalesce(f.payload->>'title', 'WOD') || '»'
    when 'badge'  then 'бейдж «' || coalesce(f.payload->>'name', '') || '»'
    when 'level'  then 'новый уровень'
    when 'streak' then 'серию 🔥'
    else 'пост' end
$$;

-- 🔥 поставить/убрать. Себе нельзя. +1 XP ставящему (лимит в день).
create or replace function public.toggle_fire(p_item bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  f feed_items;
  v_fired boolean;
  v_name text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into f from feed_items where id = p_item for update;
  if not found or not is_gym_member(f.gym_id) then raise exception 'not_found'; end if;
  if f.user_id = uid then raise exception 'own_item'; end if;

  delete from fires where feed_item_id = p_item and user_id = uid;
  if found then
    v_fired := false;
    update feed_items set fire_count = greatest(fire_count - 1, 0) where id = p_item returning * into f;
    update user_stats set fires_given = greatest(fires_given - 1, 0) where user_id = uid;
    update user_stats set fires_received = greatest(fires_received - 1, 0) where user_id = f.user_id;
  else
    v_fired := true;
    insert into fires (feed_item_id, user_id) values (p_item, uid);
    update feed_items set fire_count = fire_count + 1 where id = p_item returning * into f;
    update user_stats set fires_given = fires_given + 1 where user_id = uid;
    update user_stats set fires_received = fires_received + 1 where user_id = f.user_id;
    perform grant_daily_xp(uid, 'fire', p_item::text);
    perform check_badges(uid, f.gym_id);
    perform check_badges(f.user_id, f.gym_id);
    -- уведомление автору — один раз от каждого человека на пост
    if (select notify from profiles where id = f.user_id)
       and not exists (select 1 from notifications where user_id = f.user_id and kind = 'fire'
                       and ref = 'fire:' || p_item || ':' || uid) then
      select display_name into v_name from profiles where id = uid;
      insert into notifications (user_id, kind, text, ref)
      values (f.user_id, 'fire', '🔥 ' || v_name || ' зажигает за твой ' || feed_item_label(f), 'fire:' || p_item || ':' || uid);
    end if;
  end if;
  return jsonb_build_object('fired', v_fired, 'fire_count', f.fire_count);
end $$;

-- Комментарий: 1–500 символов, +2 XP (лимит в день), уведомление автору
create or replace function public.add_comment(p_item bigint, p_body text) returns public.comments
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  f feed_items;
  c comments;
  v_body text := trim(coalesce(p_body, ''));
  v_name text;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if length(v_body) < 1 or length(v_body) > 500 then raise exception 'invalid_comment'; end if;
  select * into f from feed_items where id = p_item for update;
  if not found or not is_gym_member(f.gym_id) then raise exception 'not_found'; end if;
  if (select count(*) from comments where user_id = uid and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'rate_limited';
  end if;

  insert into comments (feed_item_id, user_id, body) values (p_item, uid, v_body) returning * into c;
  update feed_items set comment_count = comment_count + 1 where id = p_item;
  perform grant_daily_xp(uid, 'comment', c.id::text);

  if f.user_id <> uid and (select notify from profiles where id = f.user_id) then
    select display_name into v_name from profiles where id = uid;
    insert into notifications (user_id, kind, text, ref)
    values (f.user_id, 'comment', '💬 ' || v_name || ' про твой ' || feed_item_label(f) || E':\n«' || left(v_body, 200) || '»',
            'comment:' || c.id);
  end if;
  return c;
end $$;

-- Удалить комментарий: свой, или тренер/владелец зала
create or replace function public.delete_comment(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  c comments;
  g uuid;
begin
  select * into c from comments where id = p_id;
  if not found then raise exception 'not_found'; end if;
  g := feed_item_gym(c.feed_item_id);
  if c.user_id <> auth.uid() and not has_gym_role(g, array['coach','owner']) then raise exception 'forbidden'; end if;
  delete from comments where id = p_id;
  update feed_items set comment_count = greatest(comment_count - 1, 0) where id = c.feed_item_id;
end $$;

-- Удалить результат: автор (исправить и перезаписать) или тренер/владелец (ошибочный результат).
-- Откатывает XP за этот результат (кроме бейджей), счётчики и восстанавливает лучший оставшийся PR.
create or replace function public.delete_result(p_result uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r results;
  w wods;
  v_key text;
  v_back int;
  v_counted boolean;
  best record;
begin
  select * into r from results where id = p_result for update;
  if not found then raise exception 'not_found'; end if;
  select * into w from wods where id = r.wod_id;
  if r.user_id is distinct from auth.uid() and not has_gym_role(w.gym_id, array['coach','owner']) then
    raise exception 'forbidden';
  end if;

  perform 1 from user_stats where user_id = r.user_id for update;
  select coalesce(sum(amount), 0), bool_or(reason = 'workout') into v_back, v_counted
  from xp_events where user_id = r.user_id and ref_id = r.id::text
    and reason in ('workout','scale','benchmark','baseline','pr','streak');
  delete from xp_events where user_id = r.user_id and ref_id = r.id::text
    and reason in ('workout','scale','benchmark','baseline','pr','streak');

  update user_stats set
    xp = greatest(xp - v_back, 0),
    level = level_for_xp(greatest(xp - v_back, 0)),
    workouts = greatest(workouts - (coalesce(v_counted, false))::int, 0),
    week_workouts = case when coalesce(v_counted, false) and week_start = bishkek_week_start()
                          and bishkek_date(r.created_at) >= week_start
                         then greatest(week_workouts - 1, 0) else week_workouts end,
    pr_count = greatest(pr_count - r.is_pr::int, 0)
  where user_id = r.user_id;

  if not r.capped then
    v_key := case
      when w.benchmark_id is not null then 'b:' || w.benchmark_id || ':' || r.scale
      when w.exercise_id is not null and w.score_type = 'weight' then 'e:' || w.exercise_id || ':' || w.rep_max
    end;
  end if;

  delete from results where id = r.id; -- каскадом: посты ленты, PR со ссылкой на результат

  if v_key is not null and not exists (select 1 from personal_records where user_id = r.user_id and pr_key = v_key) then
    select r2.id, r2.score, r2.created_at into best
    from results r2 join wods w2 on w2.id = r2.wod_id
    where r2.user_id = r.user_id and not r2.capped
      and (case when w.benchmark_id is not null
                then w2.benchmark_id = w.benchmark_id and r2.scale = r.scale
                else w2.exercise_id = w.exercise_id and w2.rep_max = w.rep_max and w2.score_type = 'weight' end)
    order by case when w.score_type = 'time' then r2.score end asc,
             case when w.score_type <> 'time' then r2.score end desc,
             r2.created_at
    limit 1;
    if best.id is not null then
      insert into personal_records (user_id, pr_key, result_id, score, achieved_at)
      values (r.user_id, v_key, best.id, best.score, best.created_at);
    end if;
  end if;
end $$;

revoke execute on function public.grant_daily_xp(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.feed_item_label(public.feed_items) from public, anon;
revoke execute on function public.toggle_fire(bigint) from public, anon;
revoke execute on function public.add_comment(bigint, text) from public, anon;
revoke execute on function public.delete_comment(bigint) from public, anon;
revoke execute on function public.delete_result(uuid) from public, anon;
grant execute on function public.toggle_fire(bigint) to authenticated;
grant execute on function public.add_comment(bigint, text) to authenticated;
grant execute on function public.delete_comment(bigint) to authenticated;
grant execute on function public.delete_result(uuid) to authenticated;
