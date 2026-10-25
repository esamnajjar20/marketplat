import { getSalesNotificationJobs, getSalesNotificationScheduleTime } from '../../src/shared/utils/salesNotificationSchedule';

describe('sales notification schedule in Asia/Gaza', () => {
  it('selects the overdue-installment job at the Gaza local 08:00 hour', () => {
    // 2026-01-15 is in Gaza's winter offset (UTC+2).
    expect(getSalesNotificationJobs(new Date('2026-01-15T06:00:00.000Z'))).toEqual([
      'report:overdue-sales-installments',
    ]);
  });

  it('selects the daily reminder at the Gaza local 20:00 hour', () => {
    // Summer offset (UTC+3): 17:00 UTC is 20:00 in Gaza.
    expect(getSalesNotificationJobs(new Date('2026-07-15T17:00:00.000Z'))).toEqual([
      'report:daily-sales-reminder',
    ]);
  });

  it('selects weekly debt and sales reports only on Sunday at local 09:00', () => {
    // 2026-01-18 is Sunday; 07:00 UTC is 09:00 in Gaza during winter.
    expect(getSalesNotificationJobs(new Date('2026-01-18T07:00:00.000Z'))).toEqual([
      'report:sales-debt-reminder',
      'report:weekly-sales-report',
    ]);
    expect(getSalesNotificationJobs(new Date('2026-01-19T07:00:00.000Z'))).toEqual([]);
  });

  it('still selects the job when the scheduled run starts late within the hour', () => {
    expect(getSalesNotificationJobs(new Date('2026-01-15T06:07:00.000Z'))).toEqual([
      'report:overdue-sales-installments',
    ]);
    expect(getSalesNotificationJobs(new Date('2026-01-15T07:00:00.000Z'))).toEqual([]);
  });

  it('reports a valid local weekday and clock time', () => {
    expect(getSalesNotificationScheduleTime(new Date('2026-01-15T06:00:00.000Z'))).toEqual({
      hour: 8,
      minute: 0,
      weekday: 4,
    });
  });
});
