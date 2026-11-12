// Шаг 1 входа: создаёт одноразовый nonce и отдаёт ссылку на бота.
// Клиент присылает свой client_secret — без него nonce нельзя обменять на сессию.
import { admin, cors, env, json, randomToken } from '../_shared/util.ts';

const TTL_MIN = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let clientSecret = '';
  try {
    clientSecret = String((await req.json()).client_secret ?? '');
  } catch { /* пустое тело */ }
  if (clientSecret.length < 20 || clientSecret.length > 200) return json({ error: 'bad_client_secret' }, 400);

  const db = admin();
  // Простой лимит частоты на весь сервис + уборка старых запросов
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from('login_requests').select('nonce', { count: 'exact', head: true }).gte('created_at', since);
  if ((count ?? 0) > 60) return json({ error: 'rate_limited' }, 429);
  await db.from('login_requests').delete().lt('expires_at', new Date(Date.now() - 86_400_000).toISOString());

  const nonce = randomToken(24); // 32 символа
  const { error } = await db.from('login_requests').insert({
    nonce,
    client_secret: clientSecret,
    expires_at: new Date(Date.now() + TTL_MIN * 60_000).toISOString(),
  });
  if (error) return json({ error: 'db_error' }, 500);

  const bot = env('TELEGRAM_BOT_USERNAME');
  return json({ nonce, url: `https://t.me/${bot}?start=login_${nonce}`, expires_in: TTL_MIN * 60 });
});
