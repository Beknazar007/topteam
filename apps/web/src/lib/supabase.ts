import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.warn('[TopTeam] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY не заданы — см. apps/web/.env.example');
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-anon-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

/** Вызов публичной Edge Function. Возвращает статус и JSON (без исключений на 4xx). */
export async function callFunction<T>(name: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${url}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey ?? '' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

/** Понятный текст ошибки RPC для пользователя. */
export function errorText(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  const map: Record<string, string> = {
    invalid_invite_code: 'Неверный код зала',
    not_authenticated: 'Нужно войти заново',
    forbidden: 'Недостаточно прав',
    invalid_date: 'Неверная дата',
    already_logged: 'Ты уже записал результат этого WOD',
    wod_closed: 'Запись закрыта: WOD старше 3 дней',
    wod_not_found: 'WOD не найден',
    invalid_score: 'Проверь результат — значение выглядит неверно',
    wod_has_results: 'Нельзя удалить: уже есть результаты',
    invalid_benchmark: 'Бенчмарк не найден',
    invalid_comment: 'Комментарий: от 1 до 500 символов',
    rate_limited: 'Слишком часто — подожди минутку',
    own_item: 'Себе 🔥 поставить нельзя',
    cannot_change_own_role: 'Свою роль менять нельзя',
  };
  for (const [k, v] of Object.entries(map)) if (msg.includes(k)) return v;
  return 'Что-то пошло не так. Попробуй ещё раз.';
}
