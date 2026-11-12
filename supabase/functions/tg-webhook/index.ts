// Webhook Telegram-бота.
//   /start                 — приветствие + кнопка Mini App
//   /start join_<КОД>      — QR на стене зала: кнопка Mini App сразу на /join/<КОД>
//   /start login_<nonce>   — подтверждение входа из браузера
//   /stop, /notify         — выкл/вкл уведомления
// Служебно: POST ?setup=1 — зарегистрировать webhook и кнопку-меню бота.
import { admin, env, json, tg } from '../_shared/util.ts';

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string; is_bot?: boolean };

const appButton = (text: string, path = '/') => ({
  inline_keyboard: [[{ text, web_app: { url: env('SITE_URL') + path } }]],
});

Deno.serve(async (req) => {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== env('TELEGRAM_WEBHOOK_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }

  if (new URL(req.url).searchParams.get('setup') === '1') {
    const set = await tg('setWebhook', {
      url: `${env('SUPABASE_URL')}/functions/v1/tg-webhook`,
      secret_token: env('TELEGRAM_WEBHOOK_SECRET'),
      allowed_updates: ['message'],
    });
    const menu = await tg('setChatMenuButton', {
      menu_button: { type: 'web_app', text: 'TopTeam', web_app: { url: env('SITE_URL') } },
    });
    const commands = await tg('setMyCommands', {
      commands: [
        { command: 'start', description: 'Открыть TopTeam' },
        { command: 'stop', description: 'Выключить уведомления' },
        { command: 'notify', description: 'Включить уведомления' },
      ],
    });
    const info = await tg('getWebhookInfo', {});
    const me = await tg('getMe', {});
    return json({
      set, menu, commands,
      info: { url: info.result?.url, error: info.result?.last_error_message },
      has_main_web_app: me.result?.has_main_web_app ?? null,
    });
  }

  const update = await req.json().catch(() => null);
  const msg = update?.message;
  const from: TgUser | undefined = msg?.from;
  const text: string = msg?.text ?? '';
  // Только личные сообщения от людей
  if (!msg || !from || from.is_bot || msg.chat?.type !== 'private') return json({ ok: true });

  const login = text.match(/^\/start\s+login_([A-Za-z0-9_-]{16,64})$/);
  if (login) {
    const { data } = await admin()
      .from('login_requests')
      .update({
        confirmed: true,
        tg_user: { id: from.id, first_name: from.first_name, last_name: from.last_name, username: from.username },
      })
      .eq('nonce', login[1])
      .eq('confirmed', false)
      .gt('expires_at', new Date().toISOString())
      .select('nonce');

    await tg('sendMessage', {
      chat_id: msg.chat.id,
      text: data?.length
        ? '✅ Вход выполнен! Вернись в браузер — или открой TopTeam прямо здесь, в Telegram 👇'
        : '⌛ Ссылка для входа устарела. Открой TopTeam кнопкой ниже — вход произойдёт сам.',
      reply_markup: appButton('🏋️ Открыть TopTeam'),
    });
    return json({ ok: true });
  }

  const join = text.match(/^\/start\s+join_([A-Za-z0-9]{6})$/);
  if (join) {
    await tg('sendMessage', {
      chat_id: msg.chat.id,
      text: '👋 Добро пожаловать в TopTeam!\nЖми кнопку — вступишь в зал и увидишь WOD дня.',
      reply_markup: appButton('🏋️ Вступить в зал', `/join/${join[1].toUpperCase()}`),
    });
    return json({ ok: true });
  }

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
        'Здесь будут приходить уведомления: новый WOD дня, 🔥 и комментарии к твоим результатам, итоги дня.\n\n' +
        '/stop — выключить уведомления, /notify — включить.',
      reply_markup: appButton('🏋️ Открыть TopTeam'),
    });
  }
  return json({ ok: true });
});
