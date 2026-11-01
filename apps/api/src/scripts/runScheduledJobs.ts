import { runChildJob } from './childJobRunner';
import { prisma } from '../config/prisma';
import { scheduledDate, type ScheduledJobDefinition } from './scheduledJobDates';

const TIME_ZONE = 'Asia/Gaza';

const JOBS: ScheduledJobDefinition[] = [
  { name: 'report:expire-ads', hour: -1, minute: 0 },
  { name: 'report:notification-digest', hour: 7, minute: 0 },
  { name: 'report:seller-response-metrics', hour: 3, minute: 0 },
  { name: 'report:cleanup-tokens', hour: 3, minute: 15 },
  { name: 'report:cleanup-failed-tasks', hour: 3, minute: 30 },
  { name: 'report:cleanup-notifications', hour: 3, minute: 30, weekdays: [0] },
  { name: 'report:cleanup-stories', hour: 3, minute: 40 },
  { name: 'report:expire-service-requests', hour: 3, minute: 45 },
  { name: 'report:cleanup-analytics', hour: 3, minute: 45 },
  { name: 'report:demote-stale-boosts', hour: 4, minute: 0, weekdays: [0] },
  { name: 'report:weekly-ad-views', hour: 8, minute: 0, weekdays: [1] },
  { name: 'report:weekly-store-views', hour: 8, minute: 15, weekdays: [1] },
  { name: 'report:weekly-service-views', hour: 8, minute: 30, weekdays: [1] },
  { name: 'report:expire-open-requests', hour: -2, minute: 20 },
];

function getGazaTime(): { hour: number; minute: number; weekday: number; dateKey: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
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
    weekday: weekdays[values.weekday],
    dateKey: `${values.year}-${values.month}-${values.day}`,
  };
}

async function claimScheduledJob(name: string, dateKey: string): Promise<boolean> {
  const claimed = await prisma.$queryRaw<Array<{ jobName: string }>>`
    INSERT INTO "scheduled_job_runs" ("jobName", "scheduledFor", "status", "attempts", "startedAt")
    VALUES (${name}, ${dateKey}, 'RUNNING', 1, NOW())
    ON CONFLICT ("jobName", "scheduledFor") DO UPDATE
      SET "status" = 'RUNNING',
          "attempts" = "scheduled_job_runs"."attempts" + 1,
          "startedAt" = NOW(),
          "completedAt" = NULL,
          "lastError" = NULL
      WHERE "scheduled_job_runs"."status" <> 'COMPLETED'
        AND (
          "scheduled_job_runs"."status" <> 'RUNNING'
          OR "scheduled_job_runs"."startedAt" < NOW() - INTERVAL '75 minutes'
        )
    RETURNING "jobName"
  `;
  return claimed.length === 1;
}

async function markScheduledJobCompleted(name: string, dateKey: string): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "scheduled_job_runs"
    SET "status" = 'COMPLETED', "completedAt" = NOW(), "lastError" = NULL
    WHERE "jobName" = ${name} AND "scheduledFor" = ${dateKey} AND "status" = 'RUNNING'
  `;
}

async function markScheduledJobFailed(name: string, dateKey: string, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
  await prisma.$executeRaw`
    UPDATE "scheduled_job_runs"
    SET "status" = 'FAILED', "lastError" = ${message}
    WHERE "jobName" = ${name} AND "scheduledFor" = ${dateKey} AND "status" = 'RUNNING'
  `;
}

async function main(): Promise<void> {
  const schema = await prisma.$queryRaw<Array<{ schedulerLedger: boolean }>>`
    SELECT to_regclass('scheduled_job_runs') IS NOT NULL AS "schedulerLedger"
  `;
  if (!schema[0]?.schedulerLedger) {
    throw new Error(
      'The scheduled_job_runs migration is not applied. Run `npx prisma migrate deploy` before enabling scheduled jobs.'
    );
  }

  const now = getGazaTime();
  const dueJobs = JOBS
    .map(job => ({ job, scheduledFor: scheduledDate(job, now) }))
    .filter((entry): entry is { job: ScheduledJobDefinition; scheduledFor: string } => entry.scheduledFor !== null);

  if (dueJobs.length === 0) {
    console.log(
      `[cron] No jobs due at ${TIME_ZONE} ${now.hour}:${String(now.minute).padStart(2, '0')}`
    );
    return;
  }

  console.log(`[cron] Due jobs: ${dueJobs.map(({ job, scheduledFor }) => `${job.name} [${scheduledFor}]`).join(', ')}`);

  const failures: string[] = [];
  for (const { job, scheduledFor } of dueJobs) {
    let claimed: boolean;
    try {
      claimed = await claimScheduledJob(job.name, scheduledFor);
    } catch (error) {
      failures.push(`${job.name}: scheduler claim failed (${error instanceof Error ? error.message : String(error)})`);
      console.error(`[cron] Could not claim ${job.name}`, error);
      continue;
    }
    if (!claimed) {
      console.log(`[cron] Skip ${job.name} [${scheduledFor}] — already completed or owned by another runner`);
      continue;
    }

    try {
      await runChildJob(job.name);
      await markScheduledJobCompleted(job.name, scheduledFor);
    } catch (error) {
      failures.push(`${job.name}: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`[cron] ${job.name} failed; continuing with remaining jobs`, error);
      try {
        await markScheduledJobFailed(job.name, scheduledFor, error);
      } catch (markError) {
        console.error(`[cron] Could not persist failure state for ${job.name}`, markError);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} scheduled job(s) failed: ${failures.join(' | ')}`);
  }
}

main()
  .catch(error => {
    console.error('[cron] Scheduled job runner failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
