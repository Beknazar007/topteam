-- TopTeam: номинации дня / недели / месяца.
-- Очки атлета за период:
--   10 за каждый тренировочный день (посещение)
-- + 5 за каждый результат в рейтинговом блоке
-- + 5 за каждого обогнанного на этой доске (блок × уровень × пол) — 1-е из 10 ценнее 1-го из 2
-- + 5 за каждый личный рекорд.
-- «Атлет/Атлетка» — отдельно М и Ж. Награда выдаётся, если в номинации ≥ 2 участников.

create table if not exists public.nomination_types (
  code    text primary key,
  period  text not null check (period in ('day','week','month')),
  name_m  text not null,
  name_f  text not null,
  emoji   text not null,
  by_sex  boolean not null default false,
  xp      int not null,
  sort    int not null default 0
);

insert into public.nomination_types (code, period, name_m, name_f, emoji, by_sex, xp, sort) values
  ('athlete_day',    'day',   'Атлет дня',       'Атлетка дня',       '🏆', true,  30,  1),
  ('athlete_week',   'week',  'Атлет недели',    'Атлетка недели',    '🏆', true,  100, 2),
  ('iron_week',      'week',  'Железная серия',  'Железная серия',    '🔥', false, 50,  3),
  ('pr_week',        'week',  'Рекордсмен',      'Рекордсменка',      '📈', false, 50,  4),
  ('athlete_month',  'month', 'Атлет месяца',    'Атлетка месяца',    '👑', true,  300, 5),
  ('iron_month',     'month', 'Железная серия',  'Железная серия',    '🔥', false, 150, 6),
  ('pr_month',       'month', 'Рекордсмен',      'Рекордсменка',      '📈', false, 150, 7),
  ('soul_month',     'month', 'Душа зала',       'Душа зала',         '💬', false, 150, 8),
  ('progress_month', 'month', 'Прогресс месяца', 'Прогресс месяца',   '🚀', false, 150, 9)
on conflict (code) do update set
  period = excluded.period, name_m = excluded.name_m, name_f = excluded.name_f, emoji = excluded.emoji,
  by_sex = excluded.by_sex, xp = excluded.xp, sort = excluded.sort;

create table if not exists public.nominations (
  id           bigserial primary key,
  gym_id       uuid not null references public.gyms on delete cascade,
  code         text not null references public.nomination_types,
  period_start date not null,
  sex          text not null default '-',
  user_id      uuid not null references public.profiles on delete cascade,
  score        int not null,
  detail       text,
  created_at   timestamptz not null default now(),
  unique (gym_id, code, period_start, sex, user_id)
);
create index if not exists nominations_gym_idx on public.nominations (gym_id, period_start desc);
create index if not exists nominations_user_idx on public.nominations (user_id);

alter table public.nomination_types enable row level security;
alter table public.nominations enable row level security;
drop policy if exists "nomination_types: все" on public.nomination_types;
create policy "nomination_types: все" on public.nomination_types for select to authenticated using (true);
drop policy if exists "nominations: члены зала" on public.nominations;
create policy "nominations: члены зала" on public.nominations for select to authenticated using (is_gym_member(gym_id));

-- Новый тип поста в ленте
alter table public.feed_items drop constraint if exists feed_items_kind_check;
alter table public.feed_items add constraint feed_items_kind_check
  check (kind in ('result','badge','level','streak','nomination'));

-- Бейджи за первую победу
insert into public.badges (code, name, emoji, rarity, description, sort, enabled) values
  ('nom_day',   'Лучший день',   '🏅', 1, 'Стать атлетом дня', 60, true),
  ('nom_week',  'Лучшая неделя', '🏆', 2, 'Стать атлетом недели', 61, true),
  ('nom_month', 'Лучший месяц',  '👑', 3, 'Стать атлетом месяца', 62, true)
on conflict (code) do nothing;

-- Конец периода
create or replace function public.period_end(p_period text, p_start date) returns date
language sql immutable as $$
  select case p_period
    when 'day' then p_start
    when 'week' then p_start + 6
    else (p_start + interval '1 month')::date - 1 end
$$;

-- Очки атлетов зала за период
create or replace function public.athlete_points(p_gym uuid, p_from date, p_to date)
returns table (user_id uuid, sex text, days int, blocks int, prs int, beaten int, points int)
language sql stable security definer set search_path = public as $$
  with ranked as (
    select lb.result_id,
           (count(*) over (partition by lb.wod_id, lb.scale, lb.sex)
            - count(*) over (partition by lb.wod_id, lb.scale, lb.sex order by lb.place))::int as beaten
    from wod_leaderboard lb join wods w on w.id = lb.wod_id
    where w.gym_id = p_gym and w.wod_date between p_from and p_to
      and w.score_type <> 'none' and w.kind not in ('warmup','cooldown')
  ),
  res as (
    select r.id, r.user_id, r.is_pr, w.wod_date
    from results r join wods w on w.id = r.wod_id
    where w.gym_id = p_gym and w.wod_date between p_from and p_to and not r.hidden
  )
  select p.id, p.sex,
         count(distinct res.wod_date)::int,
         count(res.id)::int,
         (count(*) filter (where res.is_pr))::int,
         coalesce(sum(rk.beaten), 0)::int,
         (10 * count(distinct res.wod_date) + 5 * count(rk.result_id)
          + 5 * coalesce(sum(rk.beaten), 0) + 5 * count(*) filter (where res.is_pr))::int
  from res
  join profiles p on p.id = res.user_id
  left join ranked rk on rk.result_id = res.id
  group by p.id, p.sex
$$;

-- Кандидаты всех номинаций периода с местами (без проверки доступа — внутренняя)
create or replace function public.nomination_candidates(p_gym uuid, p_period text, p_start date)
returns table (code text, sex text, place int, user_id uuid, score int, detail text, participants int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  d_to date := period_end(p_period, p_start);
  sfx text := case p_period when 'day' then 'day' when 'week' then 'week' else 'month' end;
begin
  return query
  with pts as (select * from athlete_points(p_gym, p_start, d_to)),
  c as (
    -- Атлет/Атлетка периода
    select 'athlete_' || sfx as code, a.sex, a.user_id, a.points as score,
           a.points || ' очк. · ' || a.days || ' трен.' || case when a.beaten > 0 then ' · обогнал(а) ' || a.beaten else '' end as detail,
           array[a.points, a.beaten, a.days] as ord
    from pts a where a.sex is not null and a.points > 0
    union all
    -- Железная серия: больше всего тренировочных дней
    select 'iron_' || sfx, '-', a.user_id, a.days, a.days || ' трен. · ' || a.blocks || ' бл.', array[a.days, a.blocks, a.points]
    from pts a where p_period <> 'day' and a.days > 0
    union all
    -- Рекордсмен: больше всего PR
    select 'pr_' || sfx, '-', a.user_id, a.prs, a.prs || ' PR', array[a.prs, a.points, 0]
    from pts a where p_period <> 'day' and a.prs > 0
    union all
    -- Душа зала: 🔥 и комментарии другим
    select 'soul_month', '-', s.user_id, x.n::int, s.f || ' 🔥 · ' || s.cm || ' комм.', array[x.n::int, s.cm::int, 0]
    from (
      select m.user_id,
             (select count(*) from fires f join feed_items fi on fi.id = f.feed_item_id
              where f.user_id = m.user_id and fi.gym_id = p_gym and fi.user_id <> m.user_id
                and bishkek_date(f.created_at) between p_start and d_to) as f,
             (select count(*) from comments cm join feed_items fi on fi.id = cm.feed_item_id
              where cm.user_id = m.user_id and fi.gym_id = p_gym and fi.user_id <> m.user_id
                and bishkek_date(cm.created_at) between p_start and d_to) as cm
      from gym_members m where m.gym_id = p_gym
    ) s cross join lateral (select s.f + s.cm as n) x
    where p_period = 'month' and s.f + s.cm > 0
    union all
    -- Прогресс месяца: больше всего новых уровней (при равенстве — XP)
    select 'progress_month', '-', g.user_id, g.lv, '+' || g.lv || ' ур. · +' || g.gained || ' XP', array[g.lv, g.gained, 0]
    from (
      select x.user_id, x.gained::int,
             (level_for_xp((x.before + x.gained)::int) - level_for_xp(x.before::int))::int as lv
      from (
        select m.user_id,
               coalesce(sum(e.amount) filter (where bishkek_date(e.created_at) < p_start), 0) as before,
               coalesce(sum(e.amount) filter (where bishkek_date(e.created_at) between p_start and d_to), 0) as gained
        from gym_members m left join xp_events e on e.user_id = m.user_id
        where m.gym_id = p_gym
        group by m.user_id
      ) x
    ) g
    where p_period = 'month' and g.gained > 0
  )
  select c.code, c.sex,
         (rank() over (partition by c.code, c.sex order by c.ord desc))::int,
         c.user_id, c.score, c.detail,
         (count(*) over (partition by c.code, c.sex))::int
  from c
  join nomination_types t on t.code = c.code;
end $$;

-- Текущая гонка за номинации (для экрана «Номинации»): топ-3 в каждой
create or replace function public.nomination_standings(p_gym uuid, p_period text, p_start date)
returns table (code text, sex text, place int, user_id uuid, score int, detail text, participants int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not is_gym_member(p_gym) then raise exception 'forbidden'; end if;
  if p_period not in ('day','week','month') then raise exception 'invalid_period'; end if;
  return query select * from nomination_candidates(p_gym, p_period, p_start) c where c.place <= 3
    order by c.code, c.sex, c.place;
end $$;

-- Подвести итоги периода: победителям — запись, XP, бейдж за первую победу, пост и уведомление. Идемпотентно.
create or replace function public.award_nominations(p_gym uuid, p_period text, p_start date) returns int
language plpgsql security definer set search_path = public as $$
declare
  x record;
  t nomination_types;
  n int := 0;
  v_name text;
  v_when text;
  v_ref text;
begin
  v_when := case p_period
    when 'day' then to_char(p_start, 'DD.MM')
    when 'week' then to_char(p_start, 'DD.MM') || '–' || to_char(p_start + 6, 'DD.MM')
    else (array['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'])
         [extract(month from p_start)::int] || ' ' || extract(year from p_start)::int end;

  for x in
    select c.*, p.sex as psex from nomination_candidates(p_gym, p_period, p_start) c
    join profiles p on p.id = c.user_id
    where c.place = 1 and c.participants >= 2
  loop
    insert into nominations (gym_id, code, period_start, sex, user_id, score, detail)
    values (p_gym, x.code, p_start, x.sex, x.user_id, x.score, x.detail)
    on conflict do nothing;
    continue when not found;

    select * into t from nomination_types where code = x.code;
    v_name := case when x.psex = 'f' then t.name_f else t.name_m end;
    v_ref := 'nom:' || p_gym || ':' || x.code || ':' || p_start || ':' || x.sex;

    insert into xp_events (user_id, reason, amount, ref_id) values (x.user_id, 'nomination', t.xp, v_ref);
    update user_stats set xp = xp + t.xp where user_id = x.user_id;
    if x.code like 'athlete_%' then
      perform award_badge(x.user_id, 'nom_' || p_period, p_gym);
    end if;
    update user_stats set level = level_for_xp(xp) where user_id = x.user_id;

    insert into feed_items (gym_id, user_id, kind, payload)
    values (p_gym, x.user_id, 'nomination', jsonb_build_object(
      'code', x.code, 'name', v_name, 'emoji', t.emoji, 'period', p_period, 'when', v_when, 'detail', x.detail, 'xp', t.xp));

    if (select notify from profiles where id = x.user_id) then
      insert into notifications (user_id, kind, text, ref)
      values (x.user_id, 'nomination', t.emoji || ' Ты — ' || v_name || ' (' || v_when || ')! ' || x.detail || ' · +' || t.xp || ' XP', v_ref);
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Ежедневно в 00:10 по Бишкеку: итоги вчерашнего дня, прошлой недели и прошлого месяца (повтор безопасен)
create or replace function public.award_due() returns int
language plpgsql security definer set search_path = public as $$
declare
  g uuid;
  n int := 0;
  d date := bishkek_today();
begin
  for g in select id from gyms loop
    n := n + award_nominations(g, 'day', d - 1);
    n := n + award_nominations(g, 'week', bishkek_week_start(d) - 7);
    n := n + award_nominations(g, 'month', (date_trunc('month', d) - interval '1 month')::date);
  end loop;
  return n;
end $$;

revoke execute on function public.athlete_points(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.nomination_candidates(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.award_nominations(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.award_due() from public, anon, authenticated;
revoke execute on function public.nomination_standings(uuid, text, date) from public, anon;
grant execute on function public.nomination_standings(uuid, text, date) to authenticated;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('topteam-nominations', '10 18 * * *', 'select public.award_due()');
  end if;
end
$do$;
