import { addDays, bishkekToday, formatDay, isLoggable, isRanked, weekStartOf } from './wod';

describe('даты WOD', () => {
  it('сегодня по Бишкеку', () => {
    expect(bishkekToday(new Date('2026-11-12T17:59:00Z'))).toBe('2026-11-12');
    expect(bishkekToday(new Date('2026-11-12T18:00:00Z'))).toBe('2026-11-13'); // полночь в Бишкеке
  });
  it('addDays через границу месяца', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('formatDay', () => {
    expect(formatDay('2026-11-13')).toBe('ПТ, 13 ноября');
  });
});

describe('неделя и блоки', () => {
  it('weekStartOf → понедельник', () => {
    expect(weekStartOf('2026-11-19')).toBe('2026-11-16'); // чт
    expect(weekStartOf('2026-11-22')).toBe('2026-11-16'); // вс
    expect(weekStartOf('2026-11-16')).toBe('2026-11-16'); // пн
  });
  it('разминку не записываем и не ранжируем', () => {
    expect(isLoggable({ kind: 'warmup' })).toBe(false);
    expect(isRanked({ kind: 'wod', score_type: 'none' })).toBe(false);
    expect(isRanked({ kind: 'strength', score_type: 'weight' })).toBe(true);
  });
});
