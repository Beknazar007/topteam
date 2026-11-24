import { defineConfig, devices } from '@playwright/test';
import { ANON_KEY, API_URL, WEB_PORT, WEB_URL } from './stand/env.mjs';

// Стенд: локальный Supabase (stand/start.mjs) + vite dev фронтенда, направленный на него.
// Прод (topteam-kl7.pages.dev, *.supabase.co) тесты не трогают никогда — см. fixtures/app.ts.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // тесты пишут в одну базу стенда
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './stand/global-setup.ts',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'ru-RU',
    timezoneId: 'Asia/Bishkek',
  },
  projects: [
    // TopTeam — телефонное приложение: все тесты в мобильном виде. Системный Chrome — без скачивания браузеров.
    { name: 'mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: `npm --prefix ../apps/web run dev -- --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
    url: WEB_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    // Переменные процесса сильнее apps/web/.env.local — фронтенд смотрит в стенд, а не в прод
    env: { VITE_SUPABASE_URL: API_URL, VITE_SUPABASE_ANON_KEY: ANON_KEY, VITE_TELEGRAM_BOT_USERNAME: 'TopTeamStandBot' },
  },
});
