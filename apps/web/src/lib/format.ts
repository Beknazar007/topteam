// Форматирование и разбор результатов.
// Хранение в БД (results.score):
//   time        — секунды
//   rounds_reps — rounds * 1000 + reps
//   reps        — повторы
//   weight      — кг (допускаются дроби, напр. 92.5)

export type ScoreType = 'time' | 'rounds_reps' | 'reps' | 'weight' | 'none';

/** 252 → "4:12", 3725 → "1:02:05" */
export function formatTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** "4:12" → 252, "1:02:05" → 3725, "75" → 75. null, если формат неверный. */
export function parseTime(input: string): number | null {
  const parts = input.trim().split(':');
  if (parts.length === 0 || parts.length > 3) return null;
  if (!parts.every((p) => /^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  // все части, кроме первой, должны быть < 60
  if (nums.slice(1).some((n) => n >= 60)) return null;
  return nums.reduce((acc, n) => acc * 60 + n, 0);
}

export function encodeRoundsReps(rounds: number, reps: number): number {
  return rounds * 1000 + reps;
}

export function decodeRoundsReps(score: number): { rounds: number; reps: number } {
  return { rounds: Math.floor(score / 1000), reps: score % 1000 };
}

function formatWeight(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} кг`;
}

/** Текст результата для карточек, ленты и рейтинга. */
export function formatScore(type: ScoreType, score: number, capped = false): string {
  if (capped) return `CAP · ${score} повт.`;
  switch (type) {
    case 'time':
      return formatTime(score);
    case 'rounds_reps': {
      const { rounds, reps } = decodeRoundsReps(score);
      return reps ? `${rounds} р. + ${reps}` : `${rounds} р.`;
    }
    case 'reps':
      return `${score} повт.`;
    case 'weight':
      return formatWeight(score);
    default:
      return '✓';
  }
}

/** Лучше ли результат a, чем b (для PR). Для времени — меньше лучше. */
export function isBetter(type: ScoreType, a: number, b: number): boolean {
  return type === 'time' ? a < b : a > b;
}
