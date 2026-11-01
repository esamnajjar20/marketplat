# Cron jobs — Marketplace backend

Jobs are standalone scripts under `src/scripts/`, not started by `server.ts`.
Use `scripts/run-job.sh` from crontab (see `deploy/crontab.example`).

## Runner

```bash
cd apps/api
chmod +x scripts/run-job.sh
./scripts/run-job.sh promotion-lifecycle
```

| Env | Default |
|-----|---------|
| `MARKETPLACE_BACKEND` | parent of `scripts/` |
| `MARKETPLACE_LOG_DIR` | `/var/log/marketplace` (fallback `logs/cron`) |
| `MARKETPLACE_LOCK_DIR` | `/tmp/marketplace-cron-locks` |

## Catalog

| Job | npm script | Schedule |
|-----|------------|----------|
| `promotion-lifecycle` | `report:promotion-lifecycle` | */15 min |
| `notification-digest` | `report:notification-digest` | Daily 07:00 |
| `seller-response-metrics` | `report:seller-response-metrics` | Daily 03:00 |
| `cleanup-tokens` | `report:cleanup-tokens` | Daily 03:15 |
| `cleanup-failed-tasks` | `report:cleanup-failed-tasks` | Daily 03:30 |
| `cleanup-notifications` | `report:cleanup-notifications` | Sun 03:30 |
| `demote-stale-boosts` | `report:demote-stale-boosts` | Sun 04:00 |
| `weekly-ad-views` | `report:weekly-ad-views` | Mon 08:00 |
| `weekly-store-views` | `report:weekly-store-views` | Mon 08:15 |
| `weekly-service-views` | `report:weekly-service-views` | Mon 08:30 |
| `expire-open-requests` | `report:expire-open-requests` | Hourly at :20 |
| `cleanup-analytics` | `report:cleanup-analytics` | Daily 03:45 |

### New jobs (phase C)

**cleanup-tokens** — removes used or expired `PasswordResetToken` rows.

**cleanup-failed-tasks** — deletes *resolved* `FailedBackgroundTask` older than
`FAILED_TASK_RETENTION_DAYS` (default 30). Logs unresolved backlog by `taskType`
(no auto-retry; types need dedicated handlers later).

**demote-stale-boosts** — clears `isFeatured` / `isPinned` on ACTIVE ads with
`updatedAt` older than `STALE_BOOST_DAYS` (default 60). Does **not** delete ads.
`DRY_RUN=1` logs candidates only.

## Optional env

```bash
export STALE_BOOST_DAYS=60
export FAILED_TASK_RETENTION_DAYS=30
export DRY_RUN=1   # only for demote-stale-boosts trial
export ANALYTICS_RETENTION_DAYS=90
```

## Not automated yet

- Cloudinary orphan purge (needs storage API inventory vs DB URLs)
- Automatic retry of each `FailedBackgroundTask.taskType`
- Hard auto-archive/delete of old ACTIVE ads (product decision)

### Analytics retention

`report:cleanup-analytics` deletes raw `analytics_events` older than
`ANALYTICS_RETENTION_DAYS` (default 90) in batches of 5,000. The admin
dashboard currently offers a maximum 90-day range, so no dashboard range
is lost by the cleanup job. If longer historical reporting is needed later,
add a daily rollup table before extending the UI beyond the retention window.

## Scheduling (production)

Scheduled jobs run via `.github/workflows/cron.yml` on GitHub Actions:

- Trigger: `0 4 * * *` (daily, 04:00 UTC = 06:00–07:00 Gaza)
- Command: `npm run cron:scheduled`
- Runner matches weekday-only for weekly jobs; every daily job runs on
  every invocation. Every script is idempotent.
- **Note:** the `hour` field on each JOBS entry documents the intended
  business hour but is not matched — daily cron fires once, so hour
  matching would silently skip all but one job.

The Render API service stays a long-lived HTTP process; the cron
workflow runs outside it. To trigger manually: GitHub → Actions →
Scheduled Jobs (daily) → Run workflow.


## Related

- `deploy/crontab.example`
- `scripts/run-job.sh`


### Ad lifecycle

- `report:expire-ads` runs from the scheduled-job runner. It warns sellers roughly 7 days before expiry and transitions due ACTIVE ads to `EXPIRED`.
- The job is idempotent and safe to invoke every 15 minutes.
- New ads receive a 60-day `expiresAt`; existing ACTIVE ads are backfilled by the lifecycle migration.

### Scheduler execution ledger and recovery

`cron:scheduled` persists one row per `(jobName, scheduledFor)` in
`scheduled_job_runs`. This prevents duplicate daily invocations and makes a
failed job eligible for a later retry without rerunning already-completed jobs.
Weekday-only jobs also have a one-business-day catch-up window. A `RUNNING`
claim can be reclaimed after 75 minutes; the GitHub Actions workflow timeout is
60 minutes. Apply migration `20261101170000_add_scheduled_job_run_ledger`
through the normal Prisma migration deployment before enabling this runner
revision. The workflow deliberately does not run production migrations itself.

Each due child runs independently. An individual failure is recorded and the
remaining due jobs still run; the parent exits non-zero at the end so the failed
workflow remains visible. Inspect the `scheduled_job_runs` table when
investigating retries or skipped jobs.

### Transactional outbox process

The outbox poller is not started by the API HTTP server. Deploy it as its own
Render **Background Worker** from the `apps/api` root directory, using the same
revision and runtime environment as the API. Recommended commands:

- Build: `npm ci && npx prisma generate && npm run build`
- Start: `npm run worker:outbox:prod`

Provide `DATABASE_URL`, `DIRECT_URL` when required by Prisma, `REDIS_URL`, and
the provider/cache variables used by notification delivery. Prefer a worker-specific
`DATABASE_URL` with a deliberately small Prisma pool (for example
`connection_limit=2&pool_timeout=30`) instead of copying the API service's full
pool size. Budget API instances, the outbox worker, and Go worker together
against the database's actual connection limit. Confirm the log
`Transactional outbox worker started`, then verify pending outbox and push
dispatch counts decrease and a test notification reaches its delivery record.
The API service alone does not prove that outbox events are being consumed.
Keep a single intended worker instance unless deliberately scaling; event
leases and idempotency protect correctness, but every instance consumes a DB
connection and contributes polling load.

### Go Worker dependency preflight

Before enabling `GO_WORKER_FCM_PUSH_ENABLED=true`, deploy Go with
`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and
`FIREBASE_PRIVATE_KEY`, then call the authenticated
`GET /internal/diagnostics` endpoint. Require `dependencies.postgres = ok` and
`dependencies.firebaseCredentials = ready`; `invalid` means the key could not
be parsed and `missing` means a required service-account value is absent.
Also send a real test notification before enabling the feature flag. Keep the
flag false until both checks pass. The diagnostics endpoint never returns the
credential values or Redis/Postgres connection strings.
