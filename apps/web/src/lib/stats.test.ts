import { describe, expect, it } from 'vitest';
import { bishkekDateOf, bishkekTimeOf, periodEnd, periodLabel, periodStart, shiftPeriod, summarize, weekdayHistogram, type LogEntry } from './stats';

const e = (date: string, created: string, pr = false): LogEntry => ({
  id: date + created, scale: 'RX', score: 1, capped: false, is_pr: pr, created_at: created,
  wods: { title: 'X', kind: 'wod', score_type: 'time', wod_date: date },
});

describe('stats', () => {
  it('periods', () => {
    expect(periodStart('week', '2026-11-24')).toBe('2026-11-23');
    expect(periodEnd('month', '2026-02-01')).toBe('2026-02-28');
    expect(shiftPeriod('month', '2026-01-01', -1)).toBe('2025-12-01');
    expect(shiftPeriod('month', '2026-12-01', 1)).toBe('2027-01-01');
    expect(periodLabel('week', '2026-11-23')).toBe('23–29 ноября');
    expect(periodLabel('week', '2026-11-30')).toBe('30 ноября – 6 декабря');
  });
  it('bishkek time', () => {
    expect(bishkekDateOf('2026-11-23T19:30:00Z')).toBe('2026-11-24');
    expect(bishkekTimeOf('2026-11-23T19:30:00Z')).toBe('01:30');
  });
  it('summary counts training days once', () => {
    const log = [e('2026-11-24', '2026-11-24T03:00:00Z', true), e('2026-11-24', '2026-11-24T03:10:00Z'), e('2026-11-20', '2026-11-20T03:00:00Z')];
    const xp = [{ reason: 'podium', amount: 30, created_at: '2026-11-24T17:59:00Z' }];
    expect(summarize(log, xp, '2026-11-23', '2026-11-29')).toEqual({ days: 1, blocks: 2, prs: 1, xp: 30, podiums: 1 });
    expect(weekdayHistogram(log, '2026-11-01', '2026-11-30')).toEqual([0, 1, 0, 0, 1, 0, 0]);
  });
});
