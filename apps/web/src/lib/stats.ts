import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { ScoreType } from './format';
import { addDays, bishkekToday, weekStartOf, type WodKind } from './wod';

export type Period = 'week' | 'month' | 'year' | 'all';

export interface LogEntry {
  id: string;
  scale: string;
  score: number;
  capped: boolean;
  is_pr: boolean;
  created_at: string;
  wods: { title: string; kind: WodKind; score_type: ScoreType; wod_date: string } | null;
}
export interface XpEntry {
  reason: string;
  amount: number;
  created_at: string;
}

/** Все мои результаты и XP-события (для мониторинга) + дата вступления в зал */
export function useMyLog(userId: string | undefined, gymId: string | undefined) {
  return useQuery({
    queryKey: ['mylog', userId, gymId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const [r, x, m] = await Promise.all([
        supabase
          .from('results')
          .select('id, scale, score, capped, is_pr, created_at, wods(title, kind, score_type, wod_date)')
          .eq('user_id', userId!)
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase.from('xp_events').select('reason, amount, created_at').eq('user_id', userId!).limit(20000),
        gymId
          ? supabase.from('gym_members').select('joined_at').eq('gym_id', gymId).eq('user_id', userId!).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (r.error) throw r.error;
      if (x.error) throw x.error;
      return {
        log: (r.data ?? []) as unknown as LogEntry[],
        xp: (x.data ?? []) as XpEntry[],
        joinedAt: (m.data as { joined_at: string } | null)?.joined_at ?? null,
      };
    },
  });
}

/** Время по Бишкеку (UTC+6) */
const bk = (ts: string) => new Date(new Date(ts).getTime() + 6 * 3600_000);
export const bishkekDateOf = (ts: string) => bk(ts).toISOString().slice(0, 10);
export const bishkekHourOf = (ts: string) => bk(ts).getUTCHours();
export const bishkekTimeOf = (ts: string) => bk(ts).toISOString().slice(11, 16);

/** Начало периода, содержащего дату */
export function periodStart(p: Period, date: string): string {
  if (p === 'week') return weekStartOf(date);
  if (p === 'month') return date.slice(0, 7) + '-01';
  if (p === 'year') return date.slice(0, 4) + '-01-01';
  return '2000-01-01';
}
/** Последний день периода, начинающегося в start */
export function periodEnd(p: Period, start: string): string {
  if (p === 'week') return addDays(start, 6);
  if (p === 'month') return addDays(shiftPeriod('month', start, 1), -1);
  if (p === 'year') return start.slice(0, 4) + '-12-31';
  return '2999-12-31';
}
/** Сдвинуть начало периода на n периодов */
export function shiftPeriod(p: Period, start: string, n: number): string {
  if (p === 'week') return addDays(start, 7 * n);
  if (p === 'year') return `${Number(start.slice(0, 4)) + n}-01-01`;
  if (p === 'month') {
    const y = Number(start.slice(0, 4));
    const m = Number(start.slice(5, 7)) - 1 + n;
    const yy = y + Math.floor(m / 12);
    const mm = ((m % 12) + 12) % 12;
    return `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
  }
  return start;
}

const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const monthName = (date: string) => MONTHS_NOM[Number(date.slice(5, 7)) - 1];
export const dayMonth = (date: string) => `${Number(date.slice(8, 10))} ${MONTHS_GEN[Number(date.slice(5, 7)) - 1]}`;

export function periodLabel(p: Period, start: string): string {
  if (p === 'week') {
    const end = periodEnd('week', start);
    return start.slice(5, 7) === end.slice(5, 7)
      ? `${Number(start.slice(8, 10))}–${dayMonth(end)}`
      : `${dayMonth(start)} – ${dayMonth(end)}`;
  }
  if (p === 'month') return `${monthName(start)} ${start.slice(0, 4)}`;
  if (p === 'year') return `${start.slice(0, 4)} год`;
  return 'За всё время';
}

export interface Summary {
  days: number;
  blocks: number;
  prs: number;
  xp: number;
  podiums: number;
}

/** Итоги за [from, to] (даты по Бишкеку). Тренировочный день — дата WOD с записанным результатом. */
export function summarize(log: LogEntry[], xp: XpEntry[], from: string, to: string): Summary {
  const inRange = (d: string) => d >= from && d <= to;
  const rs = log.filter((r) => r.wods && inRange(r.wods.wod_date));
  const xs = xp.filter((x) => inRange(bishkekDateOf(x.created_at)));
  return {
    days: new Set(rs.map((r) => r.wods!.wod_date)).size,
    blocks: rs.length,
    prs: rs.filter((r) => r.is_pr).length,
    xp: xs.reduce((s, x) => s + x.amount, 0),
    podiums: xs.filter((x) => x.reason === 'podium').length,
  };
}

/** Сколько результатов в каждый день */
export function dayCounts(log: LogEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of log) if (r.wods) m.set(r.wods.wod_date, (m.get(r.wods.wod_date) ?? 0) + 1);
  return m;
}

/** Распределение записей по часам (0–23) за период */
export function hourHistogram(log: LogEntry[], from: string, to: string): number[] {
  const h = Array<number>(24).fill(0);
  for (const r of log) if (r.wods && r.wods.wod_date >= from && r.wods.wod_date <= to) h[bishkekHourOf(r.created_at)]++;
  return h;
}

/** Дни недели (0 = Пн) — сколько тренировочных дней пришлось на каждый */
export function weekdayHistogram(log: LogEntry[], from: string, to: string): number[] {
  const days = new Set(log.filter((r) => r.wods && r.wods.wod_date >= from && r.wods.wod_date <= to).map((r) => r.wods!.wod_date));
  const h = Array<number>(7).fill(0);
  for (const d of days) h[(new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7]++;
  return h;
}

/** Сколько дней прошло с даты (по Бишкеку) */
export function daysSince(ts: string, today = bishkekToday()): number {
  return Math.round((Date.parse(today) - Date.parse(bishkekDateOf(ts))) / 86_400_000);
}
