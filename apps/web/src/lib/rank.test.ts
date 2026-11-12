import { rankRows, timeAgo } from './rank';

describe('rankRows', () => {
  it('время: меньше лучше, капнутые в конце по повторам, равные делят место', () => {
    const rows = [
      { id: 'a', score: 300, capped: false },
      { id: 'b', score: 150, capped: true },
      { id: 'c', score: 250, capped: false },
      { id: 'd', score: 250, capped: false },
      { id: 'e', score: 170, capped: true },
    ];
    expect(rankRows(rows, 'time').map((r) => `${r.id}${r.place}`)).toEqual(['c1', 'd1', 'a3', 'e4', 'b5']);
  });
  it('вес: больше лучше', () => {
    expect(rankRows([{ score: 100, capped: false }, { score: 120, capped: false }], 'weight').map((r) => r.score)).toEqual([120, 100]);
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-13T12:00:00Z').getTime();
  it('форматы', () => {
    expect(timeAgo('2026-11-13T11:59:30Z', now)).toBe('только что');
    expect(timeAgo('2026-11-13T11:55:00Z', now)).toBe('5 мин');
    expect(timeAgo('2026-11-13T09:00:00Z', now)).toBe('3 ч');
    expect(timeAgo('2026-11-12T09:00:00Z', now)).toBe('вчера');
  });
});
