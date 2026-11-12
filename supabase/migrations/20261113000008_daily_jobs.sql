-- TopTeam: этап 4 — итоги дня, закрытие недель, напоминания, очередь уведомлений

-- Итоги дня (23:59 Бишкек): топ-3 каждой доски (WOD × уровень × пол) → XP, пьедесталы, бейджи, уведомление.
-- Доска засчитывается, если на ней ≥ 2 атлетов (одиночный результат — не соревнование). Идемпотентно.
create or replace function public.daily_podium(p_date date default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  d date := coalesce(p_date, bishkek_today());
  x record;
  n int := 0;
  amt int;
  v_ref text;
begin
  for x in
    select * from (
      select lb.user_id, lb.wod_id, lb.scale, lb.sex, lb.place, w.gym_id, w.title,
             count(*) over (partition by lb.wod_id, lb.scale, lb.sex) as board_size
      from wod_leaderboard lb join wods w on w.id = lb.wod_id
      where w.wod_date = d and w.score_type <> 'none'
    ) b
    where b.place <= 3 and b.board_size >= 2
  loop
    v_ref := 'podium:' || x.wod_id || ':' || x.scale || ':' || coalesce(x.sex, '-');
    continue when exists (select 1 from xp_events where user_id = x.user_id and reason = 'podium' and ref_id = v_ref);

    amt := cfg('xp.podium_' || x.place);
    insert into xp_events (user_id, reason, amount, ref_id) values (x.user_id, 'podium', amt, v_ref);
    update user_stats set xp = xp + amt, podiums = podiums + 1, wins = wins + (x.place = 1)::int
    where user_id = x.user_id;
    perform award_badge(x.user_id, 'podium', x.gym_id);
    if x.place = 1 then perform award_badge(x.user_id, 'champion', x.gym_id); end if;
    update user_stats set level = level_for_xp(xp) where user_id = x.user_id;

    if (select notify from profiles where id = x.user_id) then
      insert into notifications (user_id, kind, text, ref)
      values (x.user_id, 'podium',
              (array['🥇','🥈','🥉'])[x.place] || ' ' || x.place || '-е место в «' || x.title || '» (' || x.scale || ')! +' || amt || ' XP',
              v_ref);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Закрытие недели (Пн 00:05 Бишкек): невыполненные недели тратят заморозку или обнуляют серию
create or replace function public.close_weeks() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  u uuid;
begin
  for u in select user_id from user_stats where week_start is distinct from bishkek_week_start() loop
    perform roll_week(u);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Напоминание о серии (Пт 18:00 Бишкек) — тем, кто тренировался раньше, но не добрал цель недели. Раз в неделю.
create or replace function public.streak_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
  wk text := 'streak:' || bishkek_week_start();
begin
  insert into notifications (user_id, kind, text, ref)
  select s.user_id, 'streak_risk',
         case when s.streak_weeks > 0
              then '🔥 Серия ' || s.streak_weeks || ' нед. под угрозой! До цели недели осталось ' || (p.week_goal - x.done) || ' трен.'
              else '💪 До цели недели осталось ' || (p.week_goal - x.done) || ' трен. — начни серию 🔥'
         end,
         wk
  from user_stats s
  join profiles p on p.id = s.user_id
  cross join lateral (select case when s.week_start = bishkek_week_start() then s.week_workouts else 0 end as done) x
  where p.notify and s.workouts > 0 and x.done < p.week_goal
    and not exists (select 1 from notifications n where n.user_id = s.user_id and n.kind = 'streak_risk' and n.ref = wk);
  get diagnostics n = row_count;
  return n;
end $$;

-- Очередь для бота: забрать до N неотправленных (не старше суток) и пометить отправленными
create or replace function public.claim_notifications(p_limit int default 25)
returns table (id bigint, tg_id bigint, text text)
language sql security definer set search_path = public as $$
  with c as (
    select n.id from notifications n
    where n.sent_at is null and n.created_at > now() - interval '1 day'
    order by n.created_at
    limit p_limit
    for update skip locked
  )
  update notifications n set sent_at = now()
  from c, profiles p
  where n.id = c.id and p.id = n.user_id
  returning n.id, p.tg_id, n.text
$$;

-- Уборка: старые уведомления и просроченные запросы входа
create or replace function public.cleanup_notifications() returns void
language sql security definer set search_path = public as $$
  delete from notifications where created_at < now() - interval '30 days';
  delete from login_requests where expires_at < now() - interval '1 day';
$$;

revoke execute on function public.daily_podium(date) from public, anon, authenticated;
revoke execute on function public.close_weeks() from public, anon, authenticated;
revoke execute on function public.streak_reminders() from public, anon, authenticated;
revoke execute on function public.claim_notifications(int) from public, anon, authenticated;
revoke execute on function public.cleanup_notifications() from public, anon, authenticated;
