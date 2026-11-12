import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Scale } from './me';
import type { ScoreType } from './format';

export type WodFormat = 'for_time' | 'amrap' | 'emom' | 'max_weight' | 'other';

export interface Wod {
  id: string;
  gym_id: string;
  wod_date: string;
  title: string;
  format: WodFormat;
  score_type: ScoreType;
  description: string;
  time_cap_sec: number | null;
  benchmark_id: number | null;
  exercise_id: number | null;
  rep_max: number | null;
  coach_note: string | null;
  created_at: string;
}
export interface Result {
  id: string;
  wod_id: string;
  user_id: string;
  scale: Scale;
  score: number;
  capped: boolean;
  is_pr: boolean;
  rpe: number | null;
  note: string | null;
}
export interface Benchmark {
  id: number;
  name: string;
  category: 'girl' | 'hero' | 'open' | 'custom';
  format: WodFormat;
  score_type: ScoreType;
  time_cap_sec: number | null;
  description: string;
}
export interface Exercise {
  id: number;
  name: string;
}

export interface LogResponse {
  result_id: string;
  score: number;
  score_type: ScoreType;
  capped: boolean;
  scale: Scale;
  is_pr: boolean;
  baseline: boolean;
  old_score: number | null;
  place: number | null;
  xp_items: { reason: string; label: string; amount: number }[];
  xp_total: number;
  badges: { code: string; name: string; emoji: string; rarity: number; xp: number }[];
  xp: number;
  level_before: number;
  level_after: number;
  streak: number;
  streak_up: boolean;
  week_workouts: number;
  week_goal: number;
}

export const FORMAT_LABEL: Record<WodFormat, string> = {
  for_time: 'For Time',
  amrap: 'AMRAP',
  emom: 'EMOM',
  max_weight: 'Max Weight',
  other: 'Other',
};

/** Сегодня по Бишкеку (UTC+6), YYYY-MM-DD — как bishkek_today() в БД. */
export function bishkekToday(now = new Date()): string {
  return new Date(now.getTime() + 6 * 3600_000).toISOString().slice(0, 10);
}
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DOW = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];
/** "2026-11-13" → "ПТ, 13 ноября" */
export function formatDay(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  return `${DOW[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export const RESULT_MAX_AGE_DAYS = 3;

/** WOD зала за последние дни (для «Сегодня» и дозаписи), новые сверху. */
export function useRecentWods(gymId: string | undefined) {
  const today = bishkekToday();
  return useQuery({
    queryKey: ['wods', gymId, today],
    enabled: Boolean(gymId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wods')
        .select('*')
        .eq('gym_id', gymId!)
        .gte('wod_date', addDays(today, -RESULT_MAX_AGE_DAYS))
        .lte('wod_date', addDays(today, 14))
        .order('wod_date', { ascending: false })
        .order('created_at');
      if (error) throw error;
      return data as Wod[];
    },
  });
}

/** Мои результаты и число результатов зала по списку WOD. */
export function useWodResults(wodIds: string[], userId: string | undefined) {
  return useQuery({
    queryKey: ['wod-results', wodIds.join(','), userId],
    enabled: wodIds.length > 0 && Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('results').select('*').in('wod_id', wodIds);
      if (error) throw error;
      const rows = data as Result[];
      const mine = new Map<string, Result>();
      const counts = new Map<string, number>();
      for (const r of rows) {
        counts.set(r.wod_id, (counts.get(r.wod_id) ?? 0) + 1);
        if (r.user_id === userId) mine.set(r.wod_id, r);
      }
      return { mine, counts };
    },
  });
}

/** Мой PR по ключу ('b:<id>:<scale>' | 'e:<id>:<rm>'). */
export function useMyPrs(userId: string | undefined) {
  return useQuery({
    queryKey: ['prs', userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase.from('personal_records').select('pr_key, score').eq('user_id', userId!);
      if (error) throw error;
      return new Map((data ?? []).map((r) => [r.pr_key as string, Number(r.score)]));
    },
  });
}

export function useBenchmarks() {
  return useQuery({
    queryKey: ['benchmarks'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('benchmarks').select('*').order('category').order('name');
      if (error) throw error;
      return data as Benchmark[];
    },
  });
}

export function useExercises() {
  return useQuery({
    queryKey: ['exercises'],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase.from('exercises').select('*').order('id');
      if (error) throw error;
      return data as Exercise[];
    },
  });
}
