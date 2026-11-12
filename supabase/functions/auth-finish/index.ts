// Шаг 3 входа: клиент опрашивает с nonce + client_secret.
// Пока бот не подтвердил — {status:'pending'}. После подтверждения создаём пользователя (если нужно)
// и отдаём одноразовый token_hash для supabase.auth.verifyOtp({type:'magiclink'}).
import { admin, cors, json } from '../_shared/util.ts';

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
  const { data: claimed } = await db
    .from('login_requests')
    .update({ used: true })
    .eq('nonce', nonce)
    .eq('used', false)
    .select('nonce');
  if (!claimed?.length) return json({ status: 'used' }, 410);

  const u = lr.tg_user as { id: number; first_name?: string; last_name?: string; username?: string };
  const email = `tg_${u.id}@users.topteam.local`;
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Атлет';
  const meta = { tg_id: u.id, tg_username: u.username ?? null, name };

  // Существующий пользователь — по профилю; иначе создаём
  let userId: string | undefined;
  const { data: prof } = await db.from('profiles').select('id').eq('tg_id', u.id).maybeSingle();
  userId = prof?.id;
  if (!userId) {
    const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true, user_metadata: meta });
    if (created?.user) userId = created.user.id;
    else if (error) console.log('createUser:', error.message); // уже существует — id возьмём из generateLink
  }

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link?.properties?.hashed_token) {
    console.log('generateLink:', linkErr?.message);
    return json({ error: 'link_failed' }, 500);
  }
  userId = userId ?? link.user?.id;
  if (!userId) return json({ error: 'no_user' }, 500);

  const { error: pErr } = await db.rpc('upsert_tg_profile', {
    p_user: userId,
    p_tg_id: u.id,
    p_username: u.username ?? '',
    p_name: name,
  });
  if (pErr) {
    console.log('upsert_tg_profile:', pErr.message);
    return json({ error: 'profile_failed' }, 500);
  }

  return json({ status: 'ok', token_hash: link.properties.hashed_token });
});
