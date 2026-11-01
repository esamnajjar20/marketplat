import { previousDateKey, scheduledDate } from '../../src/scripts/scheduledJobDates';

describe('scheduled job business dates', () => {
  it('returns the invocation date for daily jobs', () => {
    expect(scheduledDate({ name: 'daily', hour: 3, minute: 0 }, {
      weekday: 2,
      dateKey: '2026-11-03',
    })).toBe('2026-11-03');
  });

  it('runs a weekday job on its configured weekday', () => {
    expect(scheduledDate({ name: 'weekly', hour: 8, minute: 0, weekdays: [1] }, {
      weekday: 1,
      dateKey: '2026-11-02',
    })).toBe('2026-11-02');
  });

  it('catches up a missed weekday run exactly once on the following day', () => {
    const job = { name: 'weekly', hour: 8, minute: 0, weekdays: [1] };
    expect(scheduledDate(job, { weekday: 2, dateKey: '2026-11-03' })).toBe('2026-11-02');
    expect(scheduledDate(job, { weekday: 3, dateKey: '2026-11-04' })).toBeNull();
  });

  it('handles week and month boundaries', () => {
    expect(previousDateKey('2026-11-01')).toBe('2026-10-31');
    expect(scheduledDate({ name: 'sunday', hour: 3, minute: 30, weekdays: [0] }, {
      weekday: 1,
      dateKey: '2026-11-02',
    })).toBe('2026-11-01');
  });

  it('rejects malformed business dates', () => {
    expect(() => previousDateKey('2026-02-30')).toThrow('Invalid business date');
    expect(() => previousDateKey('not-a-date')).toThrow('Invalid business date');
  });
});
