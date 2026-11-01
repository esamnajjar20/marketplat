export type ScheduledJobDefinition = {
  name: string;
  hour: number;
  minute: number;
  weekdays?: number[];
};

export type BusinessClock = {
  weekday: number;
  dateKey: string;
};

export function previousDateKey(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new Error(`Invalid business date: ${dateKey}`);
  }
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) {
    throw new Error(`Invalid business date: ${dateKey}`);
  }
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The scheduled workflow runs once per day. Daily jobs are due on that
 * invocation; weekday jobs are due on their configured day, with a one-day
 * catch-up window when the previous day's workflow invocation was missed.
 * The persisted run ledger prevents the catch-up path from duplicating a
 * successfully completed job.
 */
export function scheduledDate(job: ScheduledJobDefinition, now: BusinessClock): string | null {
  if (!job.weekdays) return now.dateKey;
  if (job.weekdays.includes(now.weekday)) return now.dateKey;
  const yesterday = (now.weekday + 6) % 7;
  if (job.weekdays.includes(yesterday)) return previousDateKey(now.dateKey);
  return null;
}
