// Рассылка уведомлений из очереди в Telegram. Вызывается pg_cron каждую минуту (заголовок x-cron-secret).
import { admin, env, json, tg } from '../_shared/util.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return new Response('forbidden', { status: 403 });

  const db = admin();
  const { data, error } = await db.rpc('claim_notifications', { p_limit: 25 });
  if (error) return json({ error: error.message }, 500);

  const site = env('SITE_URL');
  let sent = 0;
  let failed = 0;
  for (const n of (data ?? []) as { id: number; tg_id: number; text: string }[]) {
    const res = await tg('sendMessage', {
      chat_id: n.tg_id,
      text: n.text,
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ text: 'Открыть TopTeam', url: site }]] },
    }).catch((e) => ({ ok: false, description: String(e) }));
    if (res.ok) {
      sent++;
    } else {
      failed++;
      await db.from('notifications').update({ error: String(res.description ?? 'error').slice(0, 300) }).eq('id', n.id);
      // Пользователь заблокировал бота — больше не пишем
      if (res.error_code === 403) await db.from('profiles').update({ notify: false }).eq('tg_id', n.tg_id);
    }
    await sleep(40); // < 30 сообщений/сек
  }
  return json({ sent, failed });
});
