# Cron jobs — Marketplace backend

Jobs are standalone scripts under `src/scripts/`, not started by `server.ts`.
Use `scripts/run-job.sh` from crontab (see `deploy/crontab.example`).

## Runner

```bash
cd backend
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
