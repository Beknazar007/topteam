// Отображение игровых величин на клиенте.
// Источник истины — сервер (supabase/migrations); формулы здесь должны совпадать с ним.

/** XP, необходимый для достижения уровня L: 50 × (L − 1)² */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 50 * (level - 1) ** 2;
}

/** Уровень по суммарному XP: floor(sqrt(xp / 50)) + 1 */
export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  let level = Math.floor(Math.sqrt(xp / 50)) + 1;
  // защита от ошибок округления float на границах уровней
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return level;
}

export function levelTitle(level: number): string {
  if (level < 5) return 'Новичок';
  if (level < 10) return 'Атлет';
  if (level < 15) return 'Боец';
  if (level < 20) return 'Ветеран';
  if (level < 30) return 'Зверь';
  return 'Легенда';
}

export interface LevelProgress {
  level: number;
  title: string;
  current: number; // XP внутри уровня
  needed: number; // XP на весь уровень
  nextAt: number; // суммарный XP следующего уровня
  percent: number; // 0..100
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const start = xpForLevel(level);
  const nextAt = xpForLevel(level + 1);
  const needed = nextAt - start;
  const current = Math.max(0, xp - start);
  return {
    level,
    title: levelTitle(level),
    current,
    needed,
    nextAt,
    percent: Math.min(100, Math.round((current / needed) * 100)),
  };
}

export type Rarity = 0 | 1 | 2 | 3;
export const RARITY_NAME: Record<Rarity, string> = {
  0: 'Обычный',
  1: 'Редкий',
  2: 'Эпический',
  3: 'Легендарный',
};
