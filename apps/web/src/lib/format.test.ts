import { decodeRoundsReps, encodeRoundsReps, formatScore, formatTime, isBetter, parseTime } from './format';

describe('время', () => {
  it('форматирует', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(252)).toBe('4:12');
    expect(formatTime(600)).toBe('10:00');
    expect(formatTime(3725)).toBe('1:02:05');
  });

  it('разбирает', () => {
    expect(parseTime('4:12')).toBe(252);
    expect(parseTime(' 3:58 ')).toBe(238);
    expect(parseTime('1:02:05')).toBe(3725);
    expect(parseTime('75')).toBe(75);
  });

  it('отклоняет мусор', () => {
    expect(parseTime('')).toBeNull();
    expect(parseTime('4:75')).toBeNull();
    expect(parseTime('a:12')).toBeNull();
    expect(parseTime('1:2:3:4')).toBeNull();
  });

  it('format ∘ parse — тождество', () => {
    for (const s of [0, 1, 59, 60, 252, 3599, 3600, 7322]) {
      expect(parseTime(formatTime(s))).toBe(s);
    }
  });
});

describe('результаты', () => {
  it('раунды + повторы', () => {
    expect(encodeRoundsReps(12, 7)).toBe(12007);
    expect(decodeRoundsReps(12007)).toEqual({ rounds: 12, reps: 7 });
    expect(formatScore('rounds_reps', 12007)).toBe('12 р. + 7');
    expect(formatScore('rounds_reps', 12000)).toBe('12 р.');
  });

  it('вес, повторы, кап', () => {
    expect(formatScore('weight', 120)).toBe('120 кг');
    expect(formatScore('weight', 92.5)).toBe('92.5 кг');
    expect(formatScore('reps', 150)).toBe('150 повт.');
    expect(formatScore('time', 180, true)).toBe('CAP · 180 повт.');
  });

  it('сравнение для PR', () => {
    expect(isBetter('time', 238, 252)).toBe(true);
    expect(isBetter('time', 260, 252)).toBe(false);
    expect(isBetter('weight', 125, 120)).toBe(true);
    expect(isBetter('rounds_reps', 12007, 12010)).toBe(false);
  });
});
