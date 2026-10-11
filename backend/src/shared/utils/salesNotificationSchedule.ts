/**
 * Pure schedule selection for the sales-notification runner.
 *
 * The workflow invokes this selector hourly in UTC. Selection must happen in
 * the business timezone so Gaza's UTC offset changes cannot make a scheduled
 * job silently miss its intended local hour.
 */
export const SALES_NOTIFICATION_TIME_ZONE = 'Asia/Gaza';

export type SalesNotificationScheduleTime = {
  hour: number;
  minute: number;
  weekday: number;
};

export function getSalesNotificationScheduleTime(date: Date = new Date()): SalesNotificationScheduleTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SALES_NOTIFICATION_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    hour: Number(values.hour) % 24,
    minute: Number(values.minute),
    weekday: weekdays[values.weekday] ?? -1,
  };
}

export function getSalesNotificationJobs(date: Date = new Date()): string[] {
  const now = getSalesNotificationScheduleTime(date);
  // Hour-level selection only. GitHub scheduled workflows are routinely delayed
  // past the top of the hour; gating on minute === 0 would silently skip jobs.
  // Overlapping runs are serialized by the workflow's concurrency group.
  const jobs: string[] = [];
  if (now.hour === 8) jobs.push('report:overdue-sales-installments');
  if (now.hour === 20) jobs.push('report:daily-sales-reminder');
  if (now.hour === 9 && now.weekday === 0) {
    jobs.push('report:sales-debt-reminder', 'report:weekly-sales-report');
  }
  return jobs;
}
