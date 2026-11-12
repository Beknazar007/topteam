// Webhook Telegram-бота. Подтверждает вход (/start login_<nonce>) и отвечает на /start.
import { admin, env, json, tg } from '../_shared/util.ts';

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean };

Deno.serve(async (req) => {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== env('TELEGRAM_WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }
  // Служебно: ?setup=1 — зарегистрировать этот URL как webhook бота (с тем же секретом)
  if (new URL(req.url).searchParams.get('setup') === '1') {
    const set = await tg('setWebhook', {
      url: `${env('SUPABASE_URL')}/functions/v1/tg-webhook`,
      secret_token: env('TELEGRAM_WEBHOOK_SECRET'),
      allowed_updates: ['message'],
    });
    const info = await tg('getWebhookInfo', {});
    return json({ set, info: { url: info.result?.url, pending: info.result?.pending_update_count, error: info.result?.last_error_message } });
  }
  const update = await req.json().catch(() => null);
  const msg = update?.message;
  const from: TgUser | undefined = msg?.from;
  const text: string = msg?.text ?? '';
  // Только личные сообщения от людей
  if (!msg || !from || from.is_bot || msg.chat?.type !== 'private') return json({ ok: true });

  const site = env('SITE_URL');
  const openButton = { inline_keyboard: [[{ text: '🏋️ Открыть TopTeam', url: site }]] };
  const m = text.match(/^\/start\s+login_([A-Za-z0-9_-]{16,64})$/);

  if (m) {
    const db = admin();
    const { data } = await db
      .from('login_requests')
      .update({
        confirmed: true,
        tg_user: { id: from.id, first_name: from.first_name, last_name: from.last_name, username: from.username },
      })
      .eq('nonce', m[1])
      .eq('confirmed', false)
      .gt('expires_at', new Date().toISOString())
      .select('nonce');

    await tg('sendMessage', {
      chat_id: msg.chat.id,
      text: data?.length
        ? '✅ Вход выполнен!\nВернись в TopTeam — приложение уже открывается.'
        : '⌛ Ссылка для входа устарела. Нажми «Войти через Telegram» в приложении ещё раз.',
      reply_markup: openButton,
    });
    return json({ ok: true });
  }

  // Вкл/выкл уведомлений
  if (text === '/stop' || text === '/notify') {
    const on = text === '/notify';
    await admin().from('profiles').update({ notify: on }).eq('tg_id', from.id);
    await tg('sendMessage', {
      chat_id: msg.chat.id,
      text: on ? '🔔 Уведомления включены.' : '🔕 Уведомления выключены. Включить снова: /notify',
    });
    return json({ ok: true });
  }

  if (text.startsWith('/start')) {
    await tg('sendMessage', {
      chat_id: msg.chat.id,
      text:
        'Привет! Я бот TopTeam — цифровой доски твоего зала 🔥\n\n' +
        'Здесь будут приходить уведомления: новый WOD дня, 🔥 и комментарии к твоим результатам, напоминания о серии.\n\n' +
        'Открой приложение и войди через Telegram:\n\n/stop — выключить уведомления, /notify — включить.',
      reply_markup: openButton,
    });
  }
  return json({ ok: true });
});
