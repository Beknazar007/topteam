-- TopTeam: этап 2 — запись результата и игровая логика (docs/04-architecture.md §5)

create or replace function public.cfg(k text) returns int
language sql stable security definer set search_path = public as $$
  select value from game_config where key = k
$$;

create or replace function public.bishkek_date(ts timestamptz) returns date
language sql immutable as $$ select (ts at time zone 'Asia/Bishkek')::date $$;

create or replace function public.level_for_xp(xp int) returns int
language sql immutable as $$ select floor(sqrt(greatest(xp, 0) / 50.0))::int + 1 $$;

-- Закрыть прошедшие недели: невыполненная неделя тратит заморозку или обнуляет серию.
-- Идемпотентно (сдвигает week_start на текущую неделю). Вызывается из log_result и кроном по понедельникам.
create or replace function public.roll_week(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s user_stats;
  goal int;
  cur date := bishkek_week_start();
  missed int;
begin
  select * into s from user_stats where user_id = p_user for update;
  if not found or s.week_start = cur then return; end if;
  if s.week_start is not null then
    select week_goal into goal from profiles where id = p_user;
    missed := (case when s.week_workouts >= goal then 0 else 1 end) + greatest(0, (cur - s.week_start) / 7 - 1);
    while missed > 0 and s.streak_weeks > 0 loop
      if s.freezes > 0 then s.freezes := s.freezes - 1; else s.streak_weeks := 0; end if;
      missed := missed - 1;
    end loop;
  end if;
  update user_stats set week_start = cur, week_workouts = 0, streak_weeks = s.streak_weeks, freezes = s.freezes
  where user_id = p_user;
end $$;

-- Проверить условия бейджей (MVP) и выдать новые. Возвращает массив выданных.
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
  return got;
end $$;

-- Записать результат WOD: одна транзакция — результат, PR, XP, серия, уровень, бейджи, лента.
-- Возвращает данные для экрана празднования.
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

  -- XP за тренировку — не больше N тренировок в день
  counted := (select count(*) from xp_events
              where user_id = uid and reason = 'workout' and bishkek_date(created_at) = today) < cfg('xp.workout_daily_limit');
  if counted then
    items := items || jsonb_build_object('reason', 'workout', 'label', 'Тренировка', 'amount', cfg('xp.workout'));
    items := items || jsonb_build_object('reason', 'scale', 'label', p_scale, 'amount', cfg('xp.scale_' || lower(p_scale)));
    if w.benchmark_id is not null then
      items := items || jsonb_build_object('reason', 'benchmark', 'label', 'Бенчмарк', 'amount', cfg('xp.benchmark'));
    end if;
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

-- Удалить WOD (тренер/владелец), только пока нет результатов
create or replace function public.delete_wod(p_wod uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  w wods;
begin
  select * into w from wods where id = p_wod;
  if not found then raise exception 'wod_not_found'; end if;
  if not has_gym_role(w.gym_id, array['coach','owner']) then raise exception 'forbidden'; end if;
  if exists (select 1 from results where wod_id = p_wod) then raise exception 'wod_has_results'; end if;
  delete from wods where id = p_wod;
end $$;

revoke execute on function public.roll_week(uuid) from public, anon, authenticated;
revoke execute on function public.check_badges(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.log_result(uuid, text, numeric, boolean, int, text) from public, anon;
revoke execute on function public.delete_wod(uuid) from public, anon;
grant execute on function public.log_result(uuid, text, numeric, boolean, int, text) to authenticated;
grant execute on function public.delete_wod(uuid) to authenticated;
