-- TopTeam: расписание (pg_cron, время UTC; Бишкек = UTC+6).
-- Секрет для вызова notify-send хранится в Vault ('topteam_cron_secret'), не в git.
-- В тестовой БД (PGlite) pg_cron нет — блок пропускается.
do $do$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron недоступен — расписание не создаётся';
    return;
  end if;
  create extension if not exists pg_cron;
  create extension if not exists pg_net with schema extensions;

  -- каждую минуту: отправить уведомления в Telegram
  perform cron.schedule('topteam-notify-send', '* * * * *', $job$
    select net.http_post(
      url := 'https://ayvhxjbhfypzixnuwshy.supabase.co/functions/v1/notify-send',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'topteam_cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 20000)
  $job$);
  -- 23:59 Бишкек: итоги дня
  perform cron.schedule('topteam-daily-podium', '59 17 * * *', 'select public.daily_podium()');
  -- Пн 00:05 Бишкек: закрыть прошлую неделю
  perform cron.schedule('topteam-close-weeks', '5 18 * * 0', 'select public.close_weeks()');
  -- Пт 18:00 Бишкек: напоминание о серии
  perform cron.schedule('topteam-streak-reminders', '0 12 * * 5', 'select public.streak_reminders()');
  -- ежедневно: уборка
  perform cron.schedule('topteam-cleanup', '30 20 * * *', 'select public.cleanup_notifications()');
end
$do$;
