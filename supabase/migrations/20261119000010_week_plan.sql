-- TopTeam: план недели — блоки дня (Разминка/Сила/WOD…), видимость дня, копирование недели,
-- одно уведомление «Тренировка дня», «один день = одна тренировка» в игре.

alter table public.wods add column if not exists kind text not null default 'wod'
  check (kind in ('warmup','skill','strength','wod','accessory','cooldown'));
alter table public.wods add column if not exists position int not null default 0;
alter table public.wods add column if not exists show_early boolean not null default false;
update public.wods set kind = 'strength' where format = 'max_weight' and kind = 'wod';
create index if not exists wods_gym_day_idx on public.wods (gym_id, wod_date, position);

insert into public.game_config (key, value) values ('xp.extra_block', 10) on conflict (key) do nothing;

-- Атлеты видят день, когда он наступил или если тренер открыл его заранее; тренер видит всё
drop policy if exists "wods: члены зала" on public.wods;
create policy "wods: члены зала" on public.wods
  for select to authenticated using (
    public.is_gym_member(gym_id)
    and (wod_date <= public.bishkek_today() or show_early or public.has_gym_role(gym_id, array['coach','owner']))
  );

-- create_wod: + блок (kind), порядок в дне, видимость; уведомления теперь шлёт notify_today()
drop function if exists public.create_wod(uuid, date, text, text, text, text, int, int, int, int, text);
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
  p_coach_note text default null,
  p_kind text default null,
  p_show_early boolean default null
) returns public.wods
language plpgsql security definer set search_path = public as $$
declare
  bm benchmarks;
  w wods;
  v_kind text;
begin
  if not has_gym_role(p_gym, array['coach','owner']) then raise exception 'forbidden'; end if;
  if p_date < bishkek_today() - 14 or p_date > bishkek_today() + 60 then raise exception 'invalid_date'; end if;

  if p_benchmark_id is not null then
    select * into bm from benchmarks where id = p_benchmark_id;
    if not found then raise exception 'invalid_benchmark'; end if;
  end if;
  v_kind := coalesce(p_kind, case when coalesce(p_format, bm.format) = 'max_weight' then 'strength' else 'wod' end);
  if v_kind not in ('warmup','skill','strength','wod','accessory','cooldown') then raise exception 'invalid_kind'; end if;

  insert into wods (gym_id, wod_date, title, format, score_type, description, time_cap_sec,
                    benchmark_id, exercise_id, rep_max, coach_note, created_by, kind, position, show_early)
  values (
    p_gym, p_date,
    coalesce(nullif(trim(p_title), ''), bm.name),
    coalesce(p_format, bm.format),
    coalesce(p_score_type, bm.score_type, case when p_format = 'max_weight' then 'weight' end),
    coalesce(nullif(trim(p_description), ''), bm.description, ''),
    coalesce(p_time_cap_sec, bm.time_cap_sec),
    p_benchmark_id, p_exercise_id, p_rep_max, nullif(trim(p_coach_note), ''), auth.uid(),
    v_kind,
    (select coalesce(max(position) + 1, 0) from wods where gym_id = p_gym and wod_date = p_date),
    coalesce(p_show_early, (select bool_or(show_early) from wods where gym_id = p_gym and wod_date = p_date), false)
  )
  returning * into w;
  return w;
end $$;

-- Редактировать блок (тренер). Формат/тип результата не меняем — от них зависят результаты и PR.
create or replace function public.update_wod(
  p_wod uuid, p_title text, p_description text, p_coach_note text, p_time_cap_sec int, p_kind text
) returns public.wods
language plpgsql security definer set search_path = public as $$
declare
  w wods;
begin
  select * into w from wods where id = p_wod;
  if not found then raise exception 'wod_not_found'; end if;
  if not has_gym_role(w.gym_id, array['coach','owner']) then raise exception 'forbidden'; end if;
  if coalesce(p_kind, w.kind) not in ('warmup','skill','strength','wod','accessory','cooldown') then raise exception 'invalid_kind'; end if;
  if coalesce(p_kind, w.kind) in ('warmup','cooldown') and exists (select 1 from results where wod_id = p_wod) then
    raise exception 'wod_has_results';
  end if;
  update wods set
    title = coalesce(nullif(trim(p_title), ''), title),
    description = coalesce(p_description, ''),
    coach_note = nullif(trim(coalesce(p_coach_note, '')), ''),
    time_cap_sec = p_time_cap_sec,
    kind = coalesce(p_kind, kind)
  where id = p_wod returning * into w;
  return w;
end $$;

-- Поменять блок местами с соседним (p_dir = -1 вверх, +1 вниз)
create or replace function public.move_wod(p_wod uuid, p_dir int) returns void
language plpgsql security definer set search_path = public as $$
declare
  w wods;
  o wods;
begin
  select * into w from wods where id = p_wod;
  if not found then raise exception 'wod_not_found'; end if;
  if not has_gym_role(w.gym_id, array['coach','owner']) then raise exception 'forbidden'; end if;
  select * into o from wods
  where gym_id = w.gym_id and wod_date = w.wod_date and id <> w.id
    and (case when p_dir < 0 then (position, created_at) < (w.position, w.created_at)
              else (position, created_at) > (w.position, w.created_at) end)
  order by case when p_dir < 0 then position end desc, case when p_dir < 0 then created_at end desc,
           case when p_dir >= 0 then position end asc, case when p_dir >= 0 then created_at end asc
  limit 1;
  if not found then return; end if;
  update wods set position = o.position where id = w.id;
  update wods set position = w.position where id = o.id;
  if o.position = w.position then -- одинаковые позиции: развести
    update wods set position = w.position + p_dir where id = w.id;
  end if;
end $$;

-- Показать день атлетам заранее (или скрыть до дня тренировки)
create or replace function public.set_day_visibility(p_gym uuid, p_date date, p_show_early boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not has_gym_role(p_gym, array['coach','owner']) then raise exception 'forbidden'; end if;
  update wods set show_early = coalesce(p_show_early, false) where gym_id = p_gym and wod_date = p_date;
end $$;

-- Скопировать неделю: блоки с p_from (Пн) в пустые дни недели p_to (Пн). Возвращает число блоков.
create or replace function public.copy_week(p_gym uuid, p_from date, p_to date) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  k int;
  c int;
begin
  if not has_gym_role(p_gym, array['coach','owner']) then raise exception 'forbidden'; end if;
  if p_to < bishkek_week_start() - 7 or p_to > bishkek_today() + 60 or p_from = p_to then raise exception 'invalid_date'; end if;
  for k in 0..6 loop
    continue when exists (select 1 from wods where gym_id = p_gym and wod_date = p_to + k);
    insert into wods (gym_id, wod_date, title, format, score_type, description, time_cap_sec,
                      benchmark_id, exercise_id, rep_max, coach_note, created_by, kind, position, show_early)
    select gym_id, p_to + k, title, format, score_type, description, time_cap_sec,
           benchmark_id, exercise_id, rep_max, coach_note, auth.uid(), kind, position, false
    from wods where gym_id = p_gym and wod_date = p_from + k;
    get diagnostics c = row_count;
    n := n + c;
  end loop;
  return n;
end $$;

-- Одно уведомление «Тренировка дня» на человека. Создателей блоков дня не уведомляем.
create or replace function public.notify_day(p_gym uuid, p_date date) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_ref text := 'day:' || p_gym || ':' || p_date;
  v_titles text;
  n int;
begin
  select string_agg(title, ' · ' order by position, created_at) into v_titles
  from wods where gym_id = p_gym and wod_date = p_date and kind not in ('warmup','cooldown');
  if v_titles is null then
    select string_agg(title, ' · ' order by position, created_at) into v_titles from wods where gym_id = p_gym and wod_date = p_date;
  end if;
  if v_titles is null then return 0; end if;

  insert into notifications (user_id, kind, text, ref)
  select m.user_id, 'new_wod',
         '🏋️ Тренировка ' || to_char(p_date, 'DD.MM') || ': ' || v_titles || E'\nЗаписывай результат в TopTeam!', v_ref
  from gym_members m join profiles p on p.id = m.user_id
  where m.gym_id = p_gym and p.notify
    and not exists (select 1 from wods w where w.gym_id = p_gym and w.wod_date = p_date and w.created_by = m.user_id)
    and not exists (select 1 from notifications n where n.user_id = m.user_id and n.kind = 'new_wod' and n.ref = v_ref);
  get diagnostics n = row_count;
  return n;
end $$;

-- Крон (07:00–22:00 Бишкек, раз в 10 мин): уведомить о сегодняшней тренировке, когда тренер закончил правки
create or replace function public.notify_today(p_min_age interval default '5 minutes') returns int
language plpgsql security definer set search_path = public as $$
declare
  g uuid;
  n int := 0;
begin
  for g in
    select gym_id from wods where wod_date = bishkek_today()
    group by gym_id having max(created_at) < now() - p_min_age
  loop
    n := n + notify_day(g, bishkek_today());
  end loop;
  return n;
end $$;

-- Запись результата: один день = одна тренировка; разминку/заминку не записываем
create or replace function public.log_result(
  p_wod uuid,
  p_scale text,
  p_score numeric,
  p_capped boolean default false,
  p_rpe int default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  today date := bishkek_today();
  w wods;
  prof profiles;
  s user_stats;
  r results;
  old_pr personal_records;
  items jsonb := '[]';
  total int;
  counted boolean;
  same_day boolean;
  v_pr_key text;
  is_pr boolean := false;
  baseline boolean := false;
  old_score numeric;
  streak_up boolean := false;
  lvl_before int;
  lvl_after int;
  xp_now int;
  badges_got jsonb;
  v_place int;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  select * into w from wods where id = p_wod;
  if not found or not is_gym_member(w.gym_id) then raise exception 'wod_not_found'; end if;
  if w.wod_date > today or w.wod_date < today - cfg('result.max_age_days') then raise exception 'wod_closed'; end if;
  if w.kind in ('warmup','cooldown') then raise exception 'not_loggable'; end if;
  if p_scale is null or p_scale not in ('RX','Scaled','Beginner') then raise exception 'invalid_scale'; end if;

  p_capped := coalesce(p_capped, false) and w.score_type = 'time';
  if w.score_type = 'none' then p_score := 1; end if;
  if p_score is null or p_score < 0
     or (w.score_type <> 'weight' and p_score <> trunc(p_score))
     or (w.score_type = 'time' and not p_capped and (p_score < 1 or p_score > 10800))
     or (w.score_type = 'time' and p_capped and p_score > 10000)
     or (w.score_type = 'weight' and (p_score <= 0 or p_score > 400))
     or (w.score_type = 'reps' and p_score > 10000)
     or (w.score_type = 'rounds_reps' and (p_score <= 0 or p_score > 999999))
  then raise exception 'invalid_score'; end if;
  if p_rpe is not null and (p_rpe < 1 or p_rpe > 10) then raise exception 'invalid_rpe'; end if;

  perform roll_week(uid);
  select * into s from user_stats where user_id = uid for update;
  select * into prof from profiles where id = uid;
  lvl_before := level_for_xp(s.xp);

  begin
    insert into results (wod_id, user_id, scale, score, capped, rpe, note)
    values (p_wod, uid, p_scale, p_score, p_capped, p_rpe, nullif(left(trim(coalesce(p_note, '')), 500), ''))
    returning * into r;
  exception when unique_violation then
    raise exception 'already_logged';
  end;

  -- Один тренировочный день = одна тренировка (блоки дня: Сила, WOD…), плюс дневной лимит тренировок
  same_day := exists (select 1 from results r2 join wods w2 on w2.id = r2.wod_id
                      where r2.user_id = uid and r2.id <> r.id and w2.gym_id = w.gym_id and w2.wod_date = w.wod_date);
  counted := not same_day and (select count(*) from xp_events
              where user_id = uid and reason = 'workout' and bishkek_date(created_at) = today) < cfg('xp.workout_daily_limit');
  if counted then
    items := items || jsonb_build_object('reason', 'workout', 'label', 'Тренировка', 'amount', cfg('xp.workout'));
    items := items || jsonb_build_object('reason', 'scale', 'label', p_scale, 'amount', cfg('xp.scale_' || lower(p_scale)));
  elsif same_day then
    items := items || jsonb_build_object('reason', 'block', 'label', 'Ещё блок дня', 'amount', cfg('xp.extra_block'));
  end if;
  if (counted or same_day) and w.benchmark_id is not null then
    items := items || jsonb_build_object('reason', 'benchmark', 'label', 'Бенчмарк', 'amount', cfg('xp.benchmark'));
  end if;

  -- Личный рекорд: бенчмарк + уровень, или упражнение + NRM. Капнутые результаты не участвуют.
  if not p_capped then
    v_pr_key := case
      when w.benchmark_id is not null then 'b:' || w.benchmark_id || ':' || p_scale
      when w.exercise_id is not null and w.score_type = 'weight' then 'e:' || w.exercise_id || ':' || w.rep_max
    end;
  end if;
  if v_pr_key is not null then
    select * into old_pr from personal_records where user_id = uid and personal_records.pr_key = v_pr_key for update;
    if not found then
      insert into personal_records (user_id, pr_key, result_id, score, achieved_at) values (uid, v_pr_key, r.id, p_score, now());
      baseline := true;
      items := items || jsonb_build_object('reason', 'baseline', 'label', 'Первый замер', 'amount', cfg('xp.baseline'));
    elsif (w.score_type = 'time' and p_score < old_pr.score) or (w.score_type <> 'time' and p_score > old_pr.score) then
      is_pr := true;
      old_score := old_pr.score;
      update personal_records set result_id = r.id, score = p_score, achieved_at = now()
      where user_id = uid and personal_records.pr_key = v_pr_key;
      update results set is_pr = true where id = r.id;
      if (select count(*) from xp_events where user_id = uid and reason = 'pr'
          and bishkek_date(created_at) = today) < cfg('xp.pr_daily_limit') then
        items := items || jsonb_build_object('reason', 'pr', 'label', 'Личный рекорд', 'amount', cfg('xp.pr'));
      end if;
      s.pr_count := s.pr_count + 1;
    end if;
  end if;

  -- Недельная серия
  if counted then
    s.workouts := s.workouts + 1;
    s.week_workouts := s.week_workouts + 1;
    if s.week_workouts = prof.week_goal then
      s.streak_weeks := s.streak_weeks + 1;
      s.best_streak := greatest(s.best_streak, s.streak_weeks);
      streak_up := true;
      if s.streak_weeks % cfg('streak.freeze_every') = 0 then
        s.freezes := least(s.freezes + 1, cfg('streak.freeze_max'));
      end if;
    end if;
    if s.streak_weeks > 0 then
      items := items || jsonb_build_object('reason', 'streak', 'label', 'Серия ×' || s.streak_weeks,
        'amount', least(cfg('xp.streak_per_week') * s.streak_weeks, cfg('xp.streak_max')));
    end if;
  end if;

  insert into xp_events (user_id, reason, amount, ref_id)
  select uid, i->>'reason', (i->>'amount')::int, r.id::text
  from jsonb_array_elements(items) i where (i->>'amount')::int > 0;
  select coalesce(sum((i->>'amount')::int), 0) into total from jsonb_array_elements(items) i;

  update user_stats set
    xp = xp + total, workouts = s.workouts, week_workouts = s.week_workouts, streak_weeks = s.streak_weeks,
    best_streak = s.best_streak, freezes = s.freezes, pr_count = s.pr_count
  where user_id = uid;

  insert into feed_items (gym_id, user_id, kind, result_id, payload)
  values (w.gym_id, uid, 'result', r.id, jsonb_build_object(
    'wod_id', w.id, 'title', w.title, 'score_type', w.score_type, 'score', p_score, 'capped', p_capped,
    'scale', p_scale, 'is_pr', is_pr, 'old_score', old_score));
  if streak_up then
    insert into feed_items (gym_id, user_id, kind, payload)
    values (w.gym_id, uid, 'streak', jsonb_build_object('weeks', s.streak_weeks));
  end if;

  badges_got := check_badges(uid, w.gym_id); -- начисляет XP за бейджи сама

  select xp into xp_now from user_stats where user_id = uid;
  lvl_after := level_for_xp(xp_now);
  update user_stats set level = lvl_after where user_id = uid;
  if lvl_after > lvl_before then
    insert into feed_items (gym_id, user_id, kind, payload)
    values (w.gym_id, uid, 'level', jsonb_build_object('level', lvl_after));
  end if;

  select place into v_place from wod_leaderboard where result_id = r.id;

  return jsonb_build_object(
    'result_id', r.id, 'score', p_score, 'score_type', w.score_type, 'capped', p_capped, 'scale', p_scale,
    'is_pr', is_pr, 'baseline', baseline, 'old_score', old_score, 'place', v_place,
    'xp_items', items, 'xp_total', total, 'badges', badges_got,
    'xp', xp_now, 'level_before', lvl_before, 'level_after', lvl_after,
    'streak', s.streak_weeks, 'streak_up', streak_up, 'week_workouts', s.week_workouts, 'week_goal', prof.week_goal);
end $$;


-- Удаление результата: откат и XP за доп. блок
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
    and reason in ('workout','scale','benchmark','baseline','pr','streak','block');
  delete from xp_events where user_id = r.user_id and ref_id = r.id::text
    and reason in ('workout','scale','benchmark','baseline','pr','streak','block');

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


revoke execute on function public.create_wod(uuid, date, text, text, text, text, int, int, int, int, text, text, boolean) from public, anon;
revoke execute on function public.update_wod(uuid, text, text, text, int, text) from public, anon;
revoke execute on function public.move_wod(uuid, int) from public, anon;
revoke execute on function public.set_day_visibility(uuid, date, boolean) from public, anon;
revoke execute on function public.copy_week(uuid, date, date) from public, anon;
revoke execute on function public.notify_day(uuid, date) from public, anon, authenticated;
revoke execute on function public.notify_today(interval) from public, anon, authenticated;
grant execute on function public.create_wod(uuid, date, text, text, text, text, int, int, int, int, text, text, boolean) to authenticated;
grant execute on function public.update_wod(uuid, text, text, text, int, text) to authenticated;
grant execute on function public.move_wod(uuid, int) to authenticated;
grant execute on function public.set_day_visibility(uuid, date, boolean) to authenticated;
grant execute on function public.copy_week(uuid, date, date) to authenticated;

-- Расписание уведомлений о тренировке дня (если есть pg_cron)
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('topteam-notify-today', '*/10 1-15 * * *', 'select public.notify_today()');
  end if;
end
$do$;
