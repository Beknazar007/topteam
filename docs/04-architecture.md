# Фаза 3 — Архитектура

## 1. Стек (всё на бесплатных тарифах)

| Слой | Выбор | Почему |
|---|---|---|
| Фронтенд | **React 18 + TypeScript + Vite** | Быстрая сборка, огромная экосистема, легко найти ответ на любой вопрос |
| PWA | **vite-plugin-pwa** (Workbox) | Манифест, установка на главный экран, офлайн-кэш оболочки |
| UI | **Tailwind CSS** + свои компоненты по токенам из Фазы 2 | Без тяжёлых UI-библиотек, полный контроль над «игровым» видом |
| Данные на клиенте | **TanStack Query** + `supabase-js` | Кэш, оптимистичные 🔥, повторы при плохой сети в зале |
| Роутинг | **React Router** | Стандарт |
| Анимации | **CSS + canvas-confetti** | Лёгкие, без Framer Motion в MVP |
| Карточки шеринга | **html-to-image** → PNG → `navigator.share({files})` | Работает на Android и iOS Safari; fallback — скачать картинку |
| Бэкенд | **Supabase** (Postgres 15+, Auth, Realtime, Edge Functions, pg_cron) | БД + авторизация + серверные функции + крон в одном бесплатном проекте |
| Игровая логика | **Функции Postgres (PL/pgSQL)** | Одна транзакция, клиент не может подделать XP |
| Telegram | **Бот** (Bot API) через Edge Function с webhook | Вход + уведомления |
| Хостинг фронта | **Cloudflare Pages** | Бесплатно, безлимитный трафик, `*.pages.dev` без покупки домена |
| Аналитика | Таблица `analytics_events` + **PostHog** (free) | Метрики из Фазы 1 |
| Тесты | **Vitest** (фронт), **PGlite** (настоящий Postgres в Node, без Docker) для миграций, RLS и игровой логики — `supabase/tests` | Ядро (XP, PR, серии) — самое критичное, тестируем в БД |
| CI | **GitHub Actions** | Тесты + деплой на push в `main` |

**Стоимость:** $0. Опционально домен ~$10/год. Ограничения free Supabase (500 МБ БД, пауза проекта после 7 дней без активности) для одного зала некритичны.

## 2. Схема системы

```
 Телефон атлета (PWA)                         Telegram
 ┌──────────────────────┐             ┌──────────────────────┐
 │ React + TanStack     │  deep link  │  @TopTeamBot          │
 │ Query + supabase-js  │────────────►│  /start login_<nonce> │
 └─────────┬────────────┘             └──────────┬───────────┘
           │ HTTPS (JWT)                          │ webhook
           ▼                                      ▼
 ┌─────────────────────────── Supabase ───────────────────────────┐
 │ PostgREST ── RLS ── таблицы          Edge Functions:            │
 │ RPC: log_result(), toggle_fire()      auth-start, auth-finish,  │
 │      create_wod(), join_gym()         tg-webhook, notify-send   │
 │ Триггеры: XP, PR, бейджи, лента       pg_cron:                  │
 │ Realtime: лента, рейтинг               • каждую минуту → notify │
 │                                        • 23:59 → топ-3 дня       │
 │                                        • Пн 00:05 → серии        │
 └────────────────────────────────────────────────────────────────┘
```

Часовой пояс всех «дней» и «недель»: **Asia/Bishkek (UTC+6)**.

## 3. Вход через Telegram (deep-link flow)

Почему не Telegram Login Widget: в установленном PWA на iOS всплывающие окна работают нестабильно. Deep-link открывает приложение Telegram напрямую, а **бонусом пользователь сразу запускает бота** — без этого бот не может слать уведомления.

```
1. PWA → auth-start          создаёт login_requests{nonce, expires_at=+5 мин}
                              ← ссылка t.me/TopTeamBot?start=login_<nonce>
2. Пользователь жмёт → Telegram → бот получает /start login_<nonce>
3. tg-webhook (проверяет X-Telegram-Bot-Api-Secret-Token)
     → login_requests.confirmed = true, tg_user = {id, first_name, username}
     → бот отвечает «✅ Вход выполнен — вернись в TopTeam»
4. PWA слушает login_requests (Realtime/опрос раз в 2 сек) → auth-finish(nonce)
     → upsert auth.users (email tg_<id>@users.topteam.local, без пароля)
     → admin.generateLink('magiclink') → отдаёт token_hash (одноразовый)
5. PWA → supabase.auth.verifyOtp({token_hash, type:'magiclink'}) → сессия
```
Nonce одноразовый, живёт 5 минут, привязан к браузеру через второй секрет (`client_secret`), который знает только PWA → чужой nonce перехватить бесполезно.

Вступление в зал: QR на стене ведёт на `/join/<invite_code>`; код сохраняется до входа и применяется после.

## 4. Схема базы данных

```sql
-- ===== Пользователи и залы =====
create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  tg_id         bigint unique not null,
  tg_username   text,
  display_name  text not null,
  avatar_url    text,
  sex           text check (sex in ('m','f')),
  default_scale text not null default 'Scaled' check (default_scale in ('RX','Scaled','Beginner')),
  week_goal     int  not null default 3 check (week_goal between 2 and 5),
  notify        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table gyms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  invite_code text unique not null,
  created_at  timestamptz not null default now()
);

create table gym_members (
  gym_id    uuid references gyms on delete cascade,
  user_id   uuid references profiles on delete cascade,
  role      text not null default 'athlete' check (role in ('athlete','coach','owner')),
  joined_at timestamptz not null default now(),
  primary key (gym_id, user_id)
);

-- ===== Справочники =====
create table exercises (            -- для силовых PR
  id   serial primary key,
  name text unique not null          -- 'Back Squat', 'Deadlift', ...
);

create table benchmarks (           -- Girls / Hero / свои
  id          serial primary key,
  name        text unique not null,  -- 'Fran'
  category    text not null check (category in ('girl','hero','open','custom')),
  score_type  text not null,         -- как у wods
  description text not null
);

-- ===== WOD и результаты =====
create table wods (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references gyms on delete cascade,
  wod_date     date not null,
  title        text not null,
  format       text not null check (format in ('for_time','amrap','emom','max_weight','other')),
  score_type   text not null check (score_type in ('time','rounds_reps','reps','weight','none')),
  description  text not null,
  time_cap_sec int,
  benchmark_id int references benchmarks,
  exercise_id  int references exercises,       -- для max_weight
  rep_max      int,                            -- 1 / 3 / 5 для max_weight
  coach_note   text,
  created_by   uuid not null references profiles,
  created_at   timestamptz not null default now()
);
create index on wods (gym_id, wod_date desc);

create table results (
  id          uuid primary key default gen_random_uuid(),
  wod_id      uuid not null references wods on delete cascade,
  user_id     uuid not null references profiles on delete cascade,
  scale       text not null check (scale in ('RX','Scaled','Beginner')),
  score       numeric not null,   -- time: секунды; rounds_reps: rounds*1000+reps; reps; weight: кг
  capped      boolean not null default false,  -- for_time не уложился в кап → score = повторы
  rpe         int check (rpe between 1 and 10),
  note        text,
  is_pr       boolean not null default false,  -- ставит сервер
  hidden      boolean not null default false,  -- тренер скрыл
  created_at  timestamptz not null default now(),
  unique (wod_id, user_id)
);
create index on results (wod_id, scale);
create index on results (user_id, created_at desc);

create table personal_records (     -- лучший результат по ключу
  user_id      uuid references profiles on delete cascade,
  pr_key       text not null,       -- 'b:12:RX' (бенчмарк) или 'e:3:1RM' (упражнение)
  result_id    uuid not null references results on delete cascade,
  score        numeric not null,
  achieved_at  timestamptz not null,
  primary key (user_id, pr_key)
);

-- ===== Соцчасть =====
create table feed_items (
  id         bigserial primary key,
  gym_id     uuid not null references gyms on delete cascade,
  user_id    uuid not null references profiles on delete cascade,
  kind       text not null check (kind in ('result','badge','level','streak')),
  result_id  uuid references results on delete cascade,
  payload    jsonb not null default '{}',   -- {badge_code} / {level} / {weeks}
  fire_count int not null default 0,
  comment_count int not null default 0,
  created_at timestamptz not null default now()
);
create index on feed_items (gym_id, created_at desc);

create table fires (
  feed_item_id bigint references feed_items on delete cascade,
  user_id      uuid references profiles on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (feed_item_id, user_id)
);

create table comments (
  id           bigserial primary key,
  feed_item_id bigint not null references feed_items on delete cascade,
  user_id      uuid not null references profiles on delete cascade,
  body         text not null check (length(body) between 1 and 500),
  created_at   timestamptz not null default now()
);

-- ===== Игра =====
create table game_config (           -- баланс правится без деплоя
  key   text primary key,            -- 'xp.workout', 'xp.pr', 'xp.streak_per_week', ...
  value int not null
);

create table user_stats (
  user_id        uuid primary key references profiles on delete cascade,
  xp             int not null default 0,
  level          int not null default 1,
  workouts       int not null default 0,
  pr_count       int not null default 0,
  streak_weeks   int not null default 0,
  best_streak    int not null default 0,
  freezes        int not null default 0,
  week_start     date,                 -- текущая неделя (Пн)
  week_workouts  int not null default 0,
  fires_given    int not null default 0,
  fires_received int not null default 0,
  podiums        int not null default 0,
  wins           int not null default 0
);

create table xp_events (             -- журнал: откуда каждый XP (аудит + антинакрутка)
  id         bigserial primary key,
  user_id    uuid not null references profiles on delete cascade,
  reason     text not null,          -- 'workout','scale_rx','benchmark','pr','streak','podium','fire','comment','badge'
  amount     int not null,
  ref_id     text,                   -- id результата/бейджа
  created_at timestamptz not null default now()
);
create index on xp_events (user_id, created_at desc);

create table badges (
  code        text primary key,       -- 'pr_machine'
  name        text not null,
  emoji       text not null,
  rarity      int not null check (rarity between 0 and 3),
  description text not null,
  enabled     boolean not null default true
);

create table user_badges (
  user_id   uuid references profiles on delete cascade,
  code      text references badges,
  earned_at timestamptz not null default now(),
  primary key (user_id, code)
);

-- ===== Служебное =====
create table login_requests (
  nonce         text primary key,
  client_secret text not null,
  tg_user       jsonb,
  confirmed     boolean not null default false,
  used          boolean not null default false,
  expires_at    timestamptz not null
);

create table notifications (         -- очередь для Telegram-бота
  id         bigserial primary key,
  user_id    uuid not null references profiles on delete cascade,
  kind       text not null,          -- 'new_wod','fire','comment','streak_risk','badge'
  text       text not null,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications (created_at) where sent_at is null;

create table analytics_events (
  id bigserial primary key, user_id uuid, name text not null,
  props jsonb default '{}', created_at timestamptz not null default now()
);
```

**Рейтинг** — представление (view), а не таблица:
```sql
-- for_time: сначала уложившиеся (capped=false) по времени ↑, потом по повторам ↓
-- остальное: score ↓
create view wod_leaderboard as
select r.*, p.display_name, p.sex,
  rank() over (partition by r.wod_id, r.scale, p.sex order by
    r.capped,
    case when w.score_type = 'time' and not r.capped then r.score end asc,
    case when w.score_type <> 'time' or r.capped then r.score end desc) as place
from results r join wods w on w.id = r.wod_id join profiles p on p.id = r.user_id
where not r.hidden;
```

## 5. Серверная игровая логика

Клиент **никогда** не пишет в `user_stats`, `xp_events`, `user_badges`, `personal_records`, `feed_items` — только через RPC (`security definer`).

### `log_result(wod_id, scale, score, capped, rpe, note)` — одна транзакция
1. Проверить: пользователь — член зала WOD; WOD не из будущего и не старше 3 дней; значение в разумных пределах (время ≤ 3 ч, вес ≤ 400 кг).
2. Вставить `results`.
3. **PR:** вычислить `pr_key` (бенчмарк+scale или упражнение+rep_max); сравнить с `personal_records` (для времени — меньше лучше). Первый результат → baseline (+15 XP, не PR). Лучше → `is_pr = true`, обновить PR.
4. **XP** (значения из `game_config`, лимиты — по `xp_events` за сегодня):
   тренировка 50 (≤ 2/день) · scale +10/+5/+5 · бенчмарк +20 · PR +50 (≤ 3/день) · серия +5×недель (≤ 40).
5. **Серия:** если `week_start` ≠ текущий понедельник — сбросить счётчик недели; `week_workouts += 1`; если стало = `week_goal` → `streak_weeks += 1`, раз в 4 недели `freezes = least(freezes+1, 2)`, лента «streak».
6. **Уровень:** `level = floor(sqrt(xp/50)) + 1`; вырос → лента «level».
7. **Бейджи:** `check_badges(user_id)` — проверяет условия по `user_stats` (табличная функция по `code`), выдаёт новые, +XP по редкости, лента «badge», уведомление.
8. Лента «result», уведомление тренеру не нужно (видит в рейтинге).
9. Вернуть клиенту JSON для экрана празднования: `{is_pr, old_pr, place, xp_items[], xp_total, level_before, level_after, streak, badges[]}`.

### Крон-задачи (pg_cron, время Бишкека)
| Когда | Что |
|---|---|
| каждую минуту | `notify-send`: отправить до 25 неотправленных уведомлений (лимит Telegram 30 сообщ./сек) |
| ежедневно 23:59 | Топ-3 по каждой доске → XP 20/15/10, `podiums`, `wins`, бейджи «На пьедестале» / «Чемпион дня» |
| Пн 00:05 | Закрыть прошлую неделю: цель не выполнена → потратить заморозку или обнулить серию |
| Пт 18:00 | «Осталось N тренировок, чтобы сохранить серию 🔥» тем, кому не хватает |

### Другие RPC
`create_wod(...)` (только coach/owner) → уведомление «WOD дня опубликован» всем членам зала · `toggle_fire(feed_item_id)` (+1 XP, ≤ 10/день, нельзя себе) · `add_comment(...)` (+2 XP, ≤ 5/день) · `join_gym(invite_code)` · `hide_result(result_id)` (тренер; откатывает XP через `xp_events`).

## 6. Безопасность (RLS)
| Таблица | Чтение | Запись |
|---|---|---|
| profiles | члены общего зала | только свой профиль (кроме `tg_id`) |
| gyms, wods, results, feed_items, comments, fires | только члены зала | только через RPC |
| user_stats, user_badges, personal_records | члены зала | только сервер |
| xp_events | только свои | только сервер |
| login_requests, notifications, game_config | — | только сервер (service role) |

Плюс: секрет webhook Telegram; токен бота и service-key — только в секретах Edge Functions; лимит частоты на `auth-start`; комментарии ≤ 500 символов.

## 7. Приватность
Храним только: Telegram id, имя, username, аватар, пол, результаты. Без телефона и почты. Кнопка «Удалить аккаунт» (каскадное удаление) — в v1.1. Короткая политика конфиденциальности на русском — к запуску.

## 8. Структура репозитория
```
topteam/
├─ apps/web/                 # PWA
│  ├─ src/
│  │  ├─ app/                # роутинг, провайдеры
│  │  ├─ features/           # auth, wod, results, leaderboard, feed, profile, game, share
│  │  ├─ components/ui/      # кнопки, карточки, шторка, тосты
│  │  ├─ lib/                # supabase client, format (время/вес), game math
│  │  └─ styles/             # токены из Фазы 2
│  └─ public/                # иконки PWA, манифест
├─ supabase/
│  ├─ migrations/            # SQL: схема, RLS, функции, сиды (бенчмарки, бейджи, game_config)
│  ├─ functions/             # auth-start, auth-finish, tg-webhook, notify-send
│  └─ tests/                 # pgTAP: XP, PR, серии, бейджи, рейтинг
├─ docs/
└─ .github/workflows/        # CI: тесты + деплой
```

## 9. Что нужно от вас перед Фазой 4
| # | Действие | Время |
|---|---|---|
| 1 | Создать бота у **@BotFather** (`/newbot`, имя TopTeam) → сохранить токен | 2 мин |
| 2 | Аккаунт **Supabase** (через GitHub) → новый проект, регион **Frankfurt (eu-central-1)** — ближайший к Бишкеку | 3 мин |
| 3 | Аккаунт **GitHub** + **Cloudflare** | 5 мин |
| 4 | Установить **Node.js 20+**, **Git**, **Supabase CLI**, **Docker Desktop** (для локальной БД) | 15 мин |

Секреты (токен бота, ключи Supabase) **не присылайте в чат** — положим их в `.env` локально и в секреты Supabase/GitHub.
