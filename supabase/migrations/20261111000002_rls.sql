-- TopTeam: Row Level Security (docs/04-architecture.md §6)
-- Принцип: читать — только своё и своего зала; писать игровые таблицы — только через RPC (security definer).

-- ===== Хелперы (security definer, чтобы не было рекурсии RLS на gym_members) =====
create or replace function public.is_gym_member(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_members where gym_id = g and user_id = auth.uid())
$$;

create or replace function public.has_gym_role(g uuid, roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gym_members where gym_id = g and user_id = auth.uid() and role = any(roles))
$$;

create or replace function public.shares_gym_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select other = auth.uid() or exists (
    select 1 from gym_members a join gym_members b on a.gym_id = b.gym_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

create or replace function public.wod_gym(w uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select gym_id from wods where id = w
$$;

create or replace function public.feed_item_gym(f bigint) returns uuid
language sql stable security definer set search_path = public as $$
  select gym_id from feed_items where id = f
$$;

-- ===== Включаем RLS везде =====
alter table public.profiles         enable row level security;
alter table public.gyms             enable row level security;
alter table public.gym_members      enable row level security;
alter table public.exercises        enable row level security;
alter table public.benchmarks       enable row level security;
alter table public.wods             enable row level security;
alter table public.results          enable row level security;
alter table public.personal_records enable row level security;
alter table public.feed_items       enable row level security;
alter table public.fires            enable row level security;
alter table public.comments         enable row level security;
alter table public.game_config      enable row level security;
alter table public.user_stats       enable row level security;
alter table public.xp_events        enable row level security;
alter table public.badges           enable row level security;
alter table public.user_badges      enable row level security;
alter table public.login_requests   enable row level security;
alter table public.notifications    enable row level security;
alter table public.analytics_events enable row level security;

-- ===== Чтение =====
create policy "profiles: я и мой зал" on public.profiles
  for select to authenticated using (public.shares_gym_with(id));

create policy "gyms: члены" on public.gyms
  for select to authenticated using (public.is_gym_member(id));

create policy "gym_members: члены зала" on public.gym_members
  for select to authenticated using (public.is_gym_member(gym_id));

create policy "exercises: все" on public.exercises for select to authenticated using (true);
create policy "benchmarks: все" on public.benchmarks for select to authenticated using (true);
create policy "badges: все" on public.badges for select to authenticated using (true);
create policy "game_config: все" on public.game_config for select to authenticated using (true);

create policy "wods: члены зала" on public.wods
  for select to authenticated using (public.is_gym_member(gym_id));

create policy "results: члены зала" on public.results
  for select to authenticated using (
    public.is_gym_member(public.wod_gym(wod_id))
    and (not hidden or user_id = auth.uid() or public.has_gym_role(public.wod_gym(wod_id), array['coach','owner']))
  );

create policy "personal_records: я и мой зал" on public.personal_records
  for select to authenticated using (public.shares_gym_with(user_id));

create policy "user_stats: я и мой зал" on public.user_stats
  for select to authenticated using (public.shares_gym_with(user_id));

create policy "user_badges: я и мой зал" on public.user_badges
  for select to authenticated using (public.shares_gym_with(user_id));

create policy "xp_events: только свои" on public.xp_events
  for select to authenticated using (user_id = auth.uid());

create policy "feed_items: члены зала" on public.feed_items
  for select to authenticated using (public.is_gym_member(gym_id));

create policy "fires: члены зала" on public.fires
  for select to authenticated using (public.is_gym_member(public.feed_item_gym(feed_item_id)));

create policy "comments: члены зала" on public.comments
  for select to authenticated using (public.is_gym_member(public.feed_item_gym(feed_item_id)));

-- ===== Запись напрямую (всё остальное — только RPC) =====
-- Профиль: только свой и только безопасные колонки
create policy "profiles: правлю себя" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (display_name, sex, default_scale, week_goal, notify) on public.profiles to authenticated;

-- Аналитика: только от своего имени
create policy "analytics: пишу своё" on public.analytics_events
  for insert to authenticated with check (user_id = auth.uid());

-- login_requests, notifications — без политик: доступ только у service_role (Edge Functions).

-- Анонимам ничего не нужно
revoke all on all tables in schema public from anon;
