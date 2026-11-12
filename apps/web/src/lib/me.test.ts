import { bishkekWeekStart, weekDone, type Stats } from './me';

describe('bishkekWeekStart', () => {
  it('понедельник по Бишкеку (UTC+6)', () => {
    expect(bishkekWeekStart(new Date('2026-11-13T10:00:00Z'))).toBe('2026-11-09'); // пятница
    expect(bishkekWeekStart(new Date('2026-11-15T19:00:00Z'))).toBe('2026-11-16'); // Вс 19:00 UTC = Пн 01:00 Бишкек
    expect(bishkekWeekStart(new Date('2026-11-16T17:59:00Z'))).toBe('2026-11-16'); // Пн 23:59 Бишкек
  });
  it('тренировки прошлой недели не считаются', () => {
    const s = { week_start: '2020-01-06', week_workouts: 3 } as Stats;
    expect(weekDone(s)).toBe(0);
    expect(weekDone({ ...s, week_start: bishkekWeekStart() })).toBe(3);
  });
});
