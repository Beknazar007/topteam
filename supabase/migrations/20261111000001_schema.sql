-- TopTeam: базовая схема (docs/04-architecture.md §4)

-- «Сегодня» и «неделя» всегда по Бишкеку (UTC+6)
create or replace function public.bishkek_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Bishkek')::date $$;

create or replace function public.bishkek_week_start(d date default null) returns date
language sql stable as $$ select date_trunc('week', coalesce(d, public.bishkek_today()))::date $$;

-- ===== Пользователи и залы =====
create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  tg_id         bigint unique not null,
  tg_username   text,
  display_name  text not null check (length(display_name) between 1 and 64),
  avatar_url    text,
  sex           text check (sex in ('m','f')),
  default_scale text not null default 'Scaled' check (default_scale in ('RX','Scaled','Beginner')),
  week_goal     int  not null default 3 check (week_goal between 2 and 5),
  notify        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table public.gyms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 2 and 80),
  city        text,
  invite_code text unique not null,
  created_at  timestamptz not null default now()
);

create table public.gym_members (
  gym_id    uuid references public.gyms on delete cascade,
  user_id   uuid references public.profiles on delete cascade,
  role      text not null default 'athlete' check (role in ('athlete','coach','owner')),
  joined_at timestamptz not null default now(),
  primary key (gym_id, user_id)
);
create index on public.gym_members (user_id);

-- ===== Справочники =====
create table public.exercises (
  id   serial primary key,
  name text unique not null
);

create table public.benchmarks (
  id          serial primary key,
  name        text unique not null,
  category    text not null check (category in ('girl','hero','open','custom')),
  format      text not null check (format in ('for_time','amrap','emom','max_weight','other')),
  score_type  text not null check (score_type in ('time','rounds_reps','reps','weight','none')),
  time_cap_sec int,
  description text not null
);

-- ===== WOD и результаты =====
create table public.wods (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms on delete cascade,
  wod_date     date not null,
  title        text not null check (length(title) between 1 and 80),
  format       text not null check (format in ('for_time','amrap','emom','max_weight','other')),
  score_type   text not null check (score_type in ('time','rounds_reps','reps','weight','none')),
  description  text not null check (length(description) <= 2000),
  time_cap_sec int check (time_cap_sec is null or time_cap_sec between 60 and 10800),
  benchmark_id int references public.benchmarks,
  exercise_id  int references public.exercises,
  rep_max      int check (rep_max is null or rep_max between 1 and 10),
  coach_note   text check (coach_note is null or length(coach_note) <= 1000),
  created_by   uuid not null references public.profiles,
  created_at   timestamptz not null default now(),
  check (format <> 'max_weight' or (exercise_id is not null and rep_max is not null and score_type = 'weight'))
);
create index on public.wods (gym_id, wod_date desc);

create table public.results (
  id          uuid primary key default gen_random_uuid(),
  wod_id      uuid not null references public.wods on delete cascade,
  user_id     uuid not null references public.profiles on delete cascade,
  scale       text not null check (scale in ('RX','Scaled','Beginner')),
  score       numeric not null check (score >= 0),
  capped      boolean not null default false,
  rpe         int check (rpe between 1 and 10),
  note        text check (note is null or length(note) <= 500),
  is_pr       boolean not null default false,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (wod_id, user_id)
);
create index on public.results (wod_id, scale);
create index on public.results (user_id, created_at desc);

create table public.personal_records (
  user_id     uuid references public.profiles on delete cascade,
  pr_key      text not null,           -- 'b:<benchmark_id>:<scale>' | 'e:<exercise_id>:<rep_max>'
  result_id   uuid not null references public.results on delete cascade,
  score       numeric not null,
  achieved_at timestamptz not null,
  primary key (user_id, pr_key)
);

-- ===== Соцчасть =====
create table public.feed_items (
  id            bigserial primary key,
  gym_id        uuid not null references public.gyms on delete cascade,
  user_id       uuid not null references public.profiles on delete cascade,
  kind          text not null check (kind in ('result','badge','level','streak')),
  result_id     uuid references public.results on delete cascade,
  payload       jsonb not null default '{}',
  fire_count    int not null default 0,
  comment_count int not null default 0,
  created_at    timestamptz not null default now()
);
create index on public.feed_items (gym_id, created_at desc);

create table public.fires (
  feed_item_id bigint references public.feed_items on delete cascade,
  user_id      uuid references public.profiles on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (feed_item_id, user_id)
);

create table public.comments (
  id           bigserial primary key,
  feed_item_id bigint not null references public.feed_items on delete cascade,
  user_id      uuid not null references public.profiles on delete cascade,
  body         text not null check (length(body) between 1 and 500),
  created_at   timestamptz not null default now()
);
create index on public.comments (feed_item_id, created_at);

-- ===== Игра =====
create table public.game_config (
  key   text primary key,
  value int not null
);

create table public.user_stats (
  user_id        uuid primary key references public.profiles on delete cascade,
  xp             int not null default 0,
  level          int not null default 1,
  workouts       int not null default 0,
  pr_count       int not null default 0,
  streak_weeks   int not null default 0,
  best_streak    int not null default 0,
  freezes        int not null default 0,
  week_start     date,
  week_workouts  int not null default 0,
  fires_given    int not null default 0,
  fires_received int not null default 0,
  podiums        int not null default 0,
  wins           int not null default 0
);

create table public.xp_events (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  reason     text not null,
  amount     int not null,
  ref_id     text,
  created_at timestamptz not null default now()
);
create index on public.xp_events (user_id, created_at desc);

create table public.badges (
  code        text primary key,
  name        text not null,
  emoji       text not null,
  rarity      int not null check (rarity between 0 and 3),
  description text not null,
  sort        int not null default 0,
  enabled     boolean not null default true
);

create table public.user_badges (
  user_id   uuid references public.profiles on delete cascade,
  code      text references public.badges,
  earned_at timestamptz not null default now(),
  primary key (user_id, code)
);

-- ===== Служебное =====
create table public.login_requests (
  nonce         text primary key,
  client_secret text not null,
  tg_user       jsonb,
  confirmed     boolean not null default false,
  used          boolean not null default false,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null
);

create table public.notifications (
  id         bigserial primary key,
  user_id    uuid not null references public.profiles on delete cascade,
  kind       text not null,
  text       text not null,
  sent_at    timestamptz,
  error      text,
  created_at timestamptz not null default now()
);
create index on public.notifications (created_at) where sent_at is null;

create table public.analytics_events (
  id         bigserial primary key,
  user_id    uuid references public.profiles on delete set null,
  name       text not null check (length(name) <= 64),
  props      jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Статистика создаётся вместе с профилем
create or replace function public.tg_profiles_create_stats() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into user_stats (user_id, week_start) values (new.id, bishkek_week_start())
  on conflict do nothing;
  return new;
end $$;

create trigger profiles_create_stats after insert on public.profiles
for each row execute function public.tg_profiles_create_stats();

-- Рейтинг WOD: for_time — уложившиеся по времени ↑, затем капнутые по повторам ↓; остальное — score ↓
create view public.wod_leaderboard with (security_invoker = true) as
select r.id as result_id, r.wod_id, r.user_id, r.scale, r.score, r.capped, r.is_pr, r.created_at,
       p.display_name, p.avatar_url, p.sex,
       rank() over (
         partition by r.wod_id, r.scale, p.sex
         order by r.capped,
                  case when w.score_type = 'time' and not r.capped then r.score end asc,
                  case when w.score_type <> 'time' or r.capped then r.score end desc
       ) as place
from public.results r
join public.wods w on w.id = r.wod_id
join public.profiles p on p.id = r.user_id
where not r.hidden;
