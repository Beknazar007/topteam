import type { ScoreType } from './format';

export interface RankRow {
  score: number;
  capped: boolean;
}

/**
 * Места в рейтинге (как wod_leaderboard в БД): сначала уложившиеся в кап,
 * время — меньше лучше, остальное (и капнутые повторы) — больше лучше. Равные — одно место.
 */
export function rankRows<T extends RankRow>(rows: T[], type: ScoreType): (T & { place: number })[] {
  const cmp = (a: T, b: T) => {
    if (a.capped !== b.capped) return a.capped ? 1 : -1;
    const asc = type === 'time' && !a.capped;
    return asc ? a.score - b.score : b.score - a.score;
  };
  const sorted = [...rows].sort(cmp);
  let place = 0;
  return sorted.map((r, i) => {
    if (i === 0 || cmp(sorted[i - 1], r) !== 0) place = i + 1;
    return { ...r, place };
  });
}

/** "5 мин", "3 ч", "вчера", "12 ноя" */
export function timeAgo(iso: string, now = Date.now()): string {
  const diff = (now - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч`;
  if (diff < 172800) return 'вчера';
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
}
