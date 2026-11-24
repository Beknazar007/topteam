// Адреса и ключи ЛОКАЛЬНОГО стенда Supabase (`supabase start`). Это общеизвестные демо-ключи
// Supabase CLI для 127.0.0.1 — не секреты и к проду отношения не имеют.
export const API_URL = 'http://127.0.0.1:54321';
export const DB_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
export const SERVICE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
export const WEB_PORT = 5186;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;
export const PASSWORD = 'stand-password-1';
// Ключ localStorage supabase-js: sb-<первая часть hostname>-auth-token
export const STORAGE_KEY = 'sb-127-auth-token';

/** Защита: стенд никогда не смотрит в прод */
export function assertLocal(url) {
  const h = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost'].includes(h)) throw new Error(`Стенд работает только с localhost, а не ${h}`);
}
