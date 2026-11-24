import { test as base, expect, type Page } from '@playwright/test';
import { ANON_KEY, API_URL, PASSWORD, STORAGE_KEY } from '../stand/env.mjs';
import { PEOPLE, emailOf } from '../stand/people.mjs';

export type Role = keyof typeof PEOPLE; // owner | coach | athlete | outsider | nurlan …
export { PEOPLE };

/** Сессия Supabase для человека стенда (вход по паролю вместо Telegram) */
export async function sessionOf(role: Role) {
  const res = await fetch(`${API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: emailOf(PEOPLE[role].tg), password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Вход ${role}: ${res.status} ${await res.text()} — стенд наполнен? (npm run stand)`);
  return res.json();
}

/** Войти под ролью: сессия кладётся в localStorage до загрузки приложения */
export async function loginAs(page: Page, role: Role, path = '/') {
  const session = await sessionOf(role);
  await page.addInitScript(([k, v]) => localStorage.setItem(k, v), [STORAGE_KEY, JSON.stringify(session)] as const);
  await page.goto(path);
}

/** Вызвать RPC от имени роли — для проверок запрета на уровне API */
export async function rpc(role: Role, fn: string, args: Record<string, unknown>) {
  const s = await sessionOf(role);
  const res = await fetch(`${API_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

/** Нет горизонтального скролла (экран телефона) */
export async function expectNoHScroll(page: Page) {
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, vw: window.innerWidth }));
  expect(w.doc, 'горизонтальный скролл').toBeLessThanOrEqual(w.vw);
}

// Предохранитель: любой запрос в прод — сразу ошибка теста
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/supabase\.co|topteam-kl7\.pages\.dev|api\.telegram\.org/, (route) => {
      throw new Error(`Запрос в прод из теста: ${route.request().url()}`);
    });
    await use(page);
  },
});
export { expect };
