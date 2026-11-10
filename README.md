# TopTeam

Цифровая доска кроссфит-зала: результаты WOD, личные рекорды, рейтинг, лента и игровая прогрессия.

- План и решения: [`docs/`](docs/) (бриф → исследование → продукт → дизайн → архитектура)
- Прототип: [`docs/prototype/index.html`](docs/prototype/index.html)

## Запуск веб-приложения

```bash
cd apps/web
npm install
cp .env.example .env.local   # заполнить после настройки Supabase
npm run dev                  # http://localhost:5173
npm test                     # юнит-тесты
npm run build                # продакшен-сборка + service worker
```
