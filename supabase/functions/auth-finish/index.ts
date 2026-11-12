// Шаг 3 входа через браузер: клиент опрашивает с nonce + client_secret.
// Пока бот не подтвердил — {status:'pending'}. После — одноразовый token_hash для verifyOtp.
import { admin, cors, json } from '../_shared/util.ts';
import { issueSession, type TgUser } from '../_shared/session.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const body = await req.json().catch(() => ({}));
  const nonce = String(body.nonce ?? '');
  const secret = String(body.client_secret ?? '');
  if (!nonce || !secret) return json({ error: 'bad_request' }, 400);

  const db = admin();
  const { data: lr } = await db.from('login_requests').select('*').eq('nonce', nonce).maybeSingle();
  if (!lr || lr.client_secret !== secret) return json({ status: 'invalid' }, 404);
  if (lr.used) return json({ status: 'used' }, 410);
  if (new Date(lr.expires_at) < new Date()) return json({ status: 'expired' }, 410);
  if (!lr.confirmed || !lr.tg_user) return json({ status: 'pending' });

  // Одноразовость: помечаем used атомарно
  const { data: claimed } = await db.from('login_requests').update({ used: true }).eq('nonce', nonce).eq('used', false).select('nonce');
  if (!claimed?.length) return json({ status: 'used' }, 410);

  const s = await issueSession(db, lr.tg_user as TgUser);
  if (s.error) return json({ error: s.error }, 500);
  return json({ status: 'ok', token_hash: s.token_hash });
});
