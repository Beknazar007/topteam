import { levelFromXp, levelProgress, levelTitle, xpForLevel } from './game';

describe('уровни', () => {
  it('порог уровня по формуле 50 × (L−1)²', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(50);
    expect(xpForLevel(5)).toBe(800);
    expect(xpForLevel(10)).toBe(4050);
    expect(xpForLevel(20)).toBe(18050);
  });

  it('уровень по XP, включая точные границы', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(49)).toBe(1);
    expect(levelFromXp(50)).toBe(2);
    expect(levelFromXp(2449)).toBe(7);
    expect(levelFromXp(2450)).toBe(8);
    expect(levelFromXp(-10)).toBe(1);
  });

  it('уровень и порог согласованы на всём диапазоне', () => {
    for (let L = 1; L <= 100; L++) {
      expect(levelFromXp(xpForLevel(L))).toBe(L);
      if (L > 1) expect(levelFromXp(xpForLevel(L) - 1)).toBe(L - 1);
    }
  });

  it('прогресс внутри уровня', () => {
    const p = levelProgress(2380); // 7 уровень: 1800..2450
    expect(p.level).toBe(7);
    expect(p.current).toBe(580);
    expect(p.needed).toBe(650);
    expect(p.nextAt).toBe(2450);
    expect(p.percent).toBe(89);
  });

  it('титулы', () => {
    expect(levelTitle(1)).toBe('Новичок');
    expect(levelTitle(5)).toBe('Атлет');
    expect(levelTitle(10)).toBe('Боец');
    expect(levelTitle(15)).toBe('Ветеран');
    expect(levelTitle(20)).toBe('Зверь');
    expect(levelTitle(30)).toBe('Легенда');
  });
});
