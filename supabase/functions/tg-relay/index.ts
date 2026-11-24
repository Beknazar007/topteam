// Ретранслятор Bot API для публикации видеоуроков (videos/tools/publish_telegram.py).
// С Mac владельца api.telegram.org недоступен, а из Supabase — доступен. Доступ только с x-cron-secret,
// и только безопасные методы: опубликовать видео в канал и проверить права бота.
import { env, json } from '../_shared/util.ts';

const ALLOWED = new Set(['getMe', 'getChat', 'getChatMember', 'sendVideo']);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (req.headers.get('x-cron-secret') !== env('CRON_SECRET')) return new Response('forbidden', { status: 403 });
  const method = new URL(req.url).searchParams.get('method') ?? '';
  if (!ALLOWED.has(method)) return json({ ok: false, description: `method not allowed: ${method}` }, 400);

  // Тело (JSON или multipart с видео) передаётся в Telegram как есть
  const res = await fetch(`https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': req.headers.get('Content-Type') ?? 'application/json' },
    body: await req.arrayBuffer(),
  });
  return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } });
});
