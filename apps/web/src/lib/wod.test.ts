import { addDays, bishkekToday, formatDay } from './wod';

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
