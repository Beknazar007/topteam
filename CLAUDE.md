# TopTeam — цифровая доска CrossFit-зала

PWA для CrossFit-залов Кыргызстана: программа дня (блоки), результаты, лидерборд, номинации, лента, профиль и мониторинг атлета, уведомления в Telegram-боте @TopTeam07Bot. Интерфейс — на русском. Продуктовые документы: `docs/00-brief.md` … `docs/04-architecture.md`.

## Стек

- **Фронтенд:** `apps/web` — React 18 + TypeScript, Vite, Tailwind (цвета темы — CSS-переменные через `color-mix`, работают модификаторы `/50`), TanStack Query 5, React Router 6, vitest. Вход — через Telegram.
- **Бэкенд:** Supabase (проект `ayvhxjbhfypzixnuwshy`, только он): Postgres + RLS, логика — в security-definer RPC на plpgsql; Edge Functions (Deno) в `supabase/functions/` (бот, уведомления); pg_cron.
- **Прод:** фронтенд — Cloudflare Pages (https://topteam-kl7.pages.dev), бэкенд — Supabase. Деплой — GitHub Actions при push в `main`.

## Структура

```
apps/web/src/features/   экраны: today, week, wod, leaderboard, feed, profile, onboarding, auth, share
apps/web/src/lib/        supabase-клиент, хуки данных (wod, stats, nominations, social), форматирование
apps/web/src/components/ общие компоненты (SideNav, карточки)
supabase/migrations/     SQL-миграции (имя: YYYYMMDDHHMMSS_slug.sql)
supabase/tests/          db.test.mjs — тесты БД на PGlite (без прода и Docker)
supabase/functions/      Edge Functions
supabase/scripts/        migrate.mjs (миграции в прод), publish-day.mjs (программа дня по фото)
specs/ reviews/ pipeline/ e2e/ docs/user-guide/ videos/   — артефакты агентов (см. ниже)
```

## Команды

```bash
cd apps/web && npm install && npm run dev          # http://localhost:5173
cd apps/web && npm run lint && npm test && npm run build   # проверка фронтенда (обязательно перед коммитом)
cd supabase/tests && npm ci && npm test            # тесты БД: все миграции + RPC/RLS на PGlite (обязательно перед коммитом)
```

**Деплой:** push в `main` сразу выкатывает: `deploy-web.yml` (фронтенд, при изменениях `apps/web/**`) и `deploy-supabase.yml` (тесты БД → миграции → функции). Поэтому **мерж в `main` = релиз в прод** — только после явного «да» человека. Токены — в `supabase/.env.deploy` и `apps/web/.env.local` (в git не попадают).

## Роли

| Роль | Видит и делает |
|---|---|
| owner (владелец зала) | всё в своём зале: роли участников, программа, код приглашения |
| coach (тренер) | программа дня/недели (блоки), видимость дней, комментарии тренера |
| athlete (атлет) | программа дня, свои результаты, лидерборд, номинации, лента, свой мониторинг |
| посторонний | ничего из зала (RLS + проверки в RPC → `forbidden`) |

Права проверяются в БД: RLS и `has_gym_role(gym, array['coach','owner'])` в RPC. Скрытие кнопок во фронтенде — не защита.

## Правила кода

- **Каждое изменение БД — с тестом** в `supabase/tests/db.test.mjs` (права каждой роли, включая запрет постороннему). Тесты БД, lint, vitest и build проходят до коммита.
- **Логика — в RPC** (`security definer`, `set search_path = public`, `revoke … from public, anon`, `grant … to authenticated`); при конфликте OUT-параметров — `#variable_conflict use_column`.
- **Миграции только новые**: старые файлы не правим. Миграция не теряет данные прода.
- **Время — Бишкек (UTC+6)**: в БД `bishkek_today()`, во фронтенде хелперы из `lib/wod.ts` / `lib/stats.ts`, не `toISOString()` для «сегодня».
- **Телефон — главный экран.** Ширина 390px без горизонтального скролла; крупные подписанные кнопки.
- **Цвета** — классы темы Tailwind (`bg-accent`, `text-muted` …), без hex в компонентах.
- **Комментарии объясняют «почему».**
- **Секреты** — только в `.env*` (git-ignored) и в панелях Supabase/Cloudflare/GitHub. service_role и токен бота — никогда во фронтенде.
- **Боевая база** — никогда не писать при разработке и тестах. Исключение — агент `coach-assistant` публикует программу дня скриптом `publish-day.mjs` после «да» человека.
- **Никогда не трогать** чужие проекты: Supabase `tmc-prod`/`tmc-dev`, Cloudflare `medrese`, `tmc-profit-express`, папку `AI ideas/tmc`.
- **Git:** работа в ветке `feature/<feature>`; коммит, пуш, мерж — только по явному указанию человека.
- **Задачи** — в хабе (`hub`, см. глобальный CLAUDE.md): `PR` с `Closes Beknazar007/projects-hub#N`.

## Проверка интерфейса без прода

`vite preview` + playwright-core: фейковая сессия в localStorage (`sb-ayvhxjbhfypzixnuwshy-auth-token`), ответы Supabase подменяются через `page.route`; у профиля должен быть `sex`, иначе редирект на онбординг. Этот же подход — основа стенда e2e (`e2e/`).

## Команда агентов (`.claude/agents/`)

Агенты связаны в цепочку командой `/pipeline <feature> [описание]` (`.claude/skills/pipeline/SKILL.md`) и файлом состояния `pipeline/<feature>.json`. Каждый агент читает этот файл в начале и дописывает в конце (что сделал, какие файлы, кто следующий); `/pipeline` по нему сам запускает следующего агента и останавливается только на ручных воротах. Субагент не может вызвать другого субагента — переход делает главная сессия.

```
pm → [человек утверждает спеку] → architect → developer ✓✓ ⇄ reviewer (≤3 итерации)
   → qa ✓✓ → [человек мержит PR = деплой] → release → docs → video-scriptwriter → video-producer ✓✓
   → [человек одобряет видео] → publisher
```

✓✓ — двойная проверка: агент сам проходит список своего режима из `.claude/agents/verifier.md`, затем `verifier` независимо проверяет всё заново. Не подтверждено — работа возвращается агенту; две неудачи подряд — решает человек.

| Агент | Результат |
|---|---|
| pm | `specs/<feature>.md` — user stories по ролям, критерии приёмки, экраны |
| architect | `specs/<feature>.plan.md` — миграции, RPC, файлы, тесты |
| developer | код и тесты в ветке `feature/<feature>` |
| reviewer | `reviews/<feature>.md` — замечания или «одобрено» |
| qa | `e2e/tests/<feature>/<role>.spec.ts` + отчёт прогона |
| verifier | `reviews/<feature>.verify.md` — независимый второй проход по работе developer, qa, video-producer |
| release | версия semver, `CHANGELOG.md`, тег `vX.Y.Z` (после подтверждения) |
| docs | `docs/user-guide/<role>.md` |
| video-scriptwriter | `videos/scenarios/<feature>.md` — шаги + озвучка |
| video-producer | `videos/output/<feature>/<role>-<lang>.mp4` + `.srt` |
| publisher | `videos/registry.json`; публикует в Telegram только одобренные видео |
| coach-assistant | вне конвейера: фото доски → программа дня в приложении (после «да») |

**Ручные ворота (агенты их не обходят):** утверждение спеки (`Статус: утверждено` ставит человек), мерж PR (= деплой в прод), тег, одобрение видео (`"approved": true` ставит человек), публикация программы дня по фото. Никаких автопубликаций.

**Здоровье и безопасность.** Советы о травмах, противопоказаниях, питании, весах для новичков — не сочиняются агентами как готовые: пометка `⚠ ТРЕБУЕТ ПРОВЕРКИ ТРЕНЕРОМ` рядом с фрагментом и в отчёте. Названия упражнений и форматов (EMOM, AMRAP, 1RM) пометки не требуют.
