import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.109.0';

export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; photo_url?: string };

/**
 * Найти/создать пользователя Supabase для Telegram-аккаунта и выдать одноразовый token_hash
 * для supabase.auth.verifyOtp({ type: 'magiclink', token_hash }).
 */
export async function issueSession(db: SupabaseClient, u: TgUser): Promise<{ token_hash?: string; error?: string }> {
  const email = `tg_${u.id}@users.topteam.local`;
  const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Атлет';

  let userId: string | undefined;
  const { data: prof } = await db.from('profiles').select('id, avatar_url').eq('tg_id', u.id).maybeSingle();
  userId = prof?.id;
  if (!userId) {
    const { data: created, error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { tg_id: u.id, tg_username: u.username ?? null, name },
    });
    if (created?.user) userId = created.user.id;
    else if (error) console.log('createUser:', error.message); // уже есть — id возьмём из generateLink
  }

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (linkErr || !link?.properties?.hashed_token) {
    console.log('generateLink:', linkErr?.message);
    return { error: 'link_failed' };
  }
  userId = userId ?? link.user?.id;
  if (!userId) return { error: 'no_user' };

  const { error: pErr } = await db.rpc('upsert_tg_profile', {
    p_user: userId,
    p_tg_id: u.id,
    p_username: u.username ?? '',
    p_name: name,
  });
  if (pErr) {
    console.log('upsert_tg_profile:', pErr.message);
    return { error: 'profile_failed' };
  }
  // Аватар из Telegram (Mini App отдаёт photo_url), если своего ещё нет
  if (u.photo_url && /^https:\/\//.test(u.photo_url) && !prof?.avatar_url) {
    await db.from('profiles').update({ avatar_url: u.photo_url }).eq('id', userId);
  }
  return { token_hash: link.properties.hashed_token };
}
