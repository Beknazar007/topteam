// Вход из Telegram Mini App: проверяем подпись initData токеном бота
// (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) и выдаём сессию.
import { admin, cors, env, json } from '../_shared/util.ts';
import { issueSession, type TgUser } from '../_shared/session.ts';

const MAX_AGE_SEC = 24 * 3600;
const enc = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

/** Возвращает пользователя Telegram, если подпись верна и данные свежие. */
export async function verifyInitData(initData: string, botToken: string): Promise<TgUser | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  const secret = await hmac(enc.encode('WebAppData'), botToken);
  if (hex(await hmac(secret, dataCheck)) !== hash) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null;
  const user = JSON.parse(params.get('user') ?? 'null') as TgUser | null;
  return user?.id ? user : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const initData = String(body.init_data ?? '');
  if (!initData || initData.length > 4096) return json({ error: 'bad_request' }, 400);

  const user = await verifyInitData(initData, env('TELEGRAM_BOT_TOKEN'));
  if (!user) return json({ error: 'invalid_init_data' }, 401);

  const s = await issueSession(admin(), user);
  if (s.error) return json({ error: s.error }, 500);
  return json({ status: 'ok', token_hash: s.token_hash });
});
