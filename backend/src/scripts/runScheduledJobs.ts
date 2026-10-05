import { spawn } from 'node:child_process';

const TIME_ZONE = 'Asia/Gaza';
// WINDOW_MINUTES removed — GitHub Actions runs hourly at :00, matching on hour only.
// const WINDOW_MINUTES = 15;

type Job = {
  name: string;
  hour: number;
  minute: number;
  weekdays?: number[];
};

const JOBS: Job[] = [
  { name: 'report:promotion-lifecycle', hour: -1, minute: 0 },
  { name: 'report:expire-ads', hour: -1, minute: 0 },
  { name: 'report:notification-digest', hour: 7, minute: 0 },
  { name: 'report:seller-response-metrics', hour: 3, minute: 0 },
  { name: 'report:cleanup-tokens', hour: 3, minute: 15 },
  { name: 'report:cleanup-failed-tasks', hour: 3, minute: 30 },
  { name: 'report:cleanup-notifications', hour: 3, minute: 30, weekdays: [0] },
  { name: 'report:expire-service-requests', hour: 3, minute: 45 },
  { name: 'report:cleanup-analytics', hour: 3, minute: 45 },
  { name: 'report:demote-stale-boosts', hour: 4, minute: 0, weekdays: [0] },
  { name: 'report:weekly-ad-views', hour: 8, minute: 0, weekdays: [1] },
  { name: 'report:weekly-store-views', hour: 8, minute: 15, weekdays: [1] },
  { name: 'report:weekly-service-views', hour: 8, minute: 30, weekdays: [1] },
  { name: 'report:expire-open-requests', hour: -2, minute: 20 },
];

function getGazaTime(): { hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());

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
    weekday: weekdays[values.weekday],
  };
}

function isDue(job: Job, now: ReturnType<typeof getGazaTime>): boolean {
  // GitHub Actions cron.yml runs this runner ONCE per day (04:00 UTC).
  // Every daily job runs on every invocation; only weekday-restricted
  // jobs (weekly reports, Sunday cleanups) are filtered here. Every
  // script is idempotent, so running them all once/day is safe.
  //
  // The `hour` field on each JOBS entry is documentation of the intended
  // business hour (Gaza) and is NOT matched here — matching it would
  // require a runner that fires at every hour, which daily cron cannot do.
  if (job.weekdays && !job.weekdays.includes(now.weekday)) return false;
  return true;
}

function runJob(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', name], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) return resolve();
      reject(new Error(`Cron job ${name} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}

async function main(): Promise<void> {
  const now = getGazaTime();
  const dueJobs = JOBS.filter((job) => isDue(job, now));

  if (dueJobs.length === 0) {
    console.log(`[cron] No jobs due at ${TIME_ZONE} ${now.hour}:${String(now.minute).padStart(2, '0')}`);
    return;
  }

  console.log(`[cron] Due jobs: ${dueJobs.map((job) => job.name).join(', ')}`);

  for (const job of dueJobs) {
    await runJob(job.name);
  }
}

main().catch((error) => {
  console.error('[cron] Scheduled job runner failed:', error);
  process.exitCode = 1;
});
