# MarketPlat Go Worker (pilot)

This is a separately deployable Go worker for maintenance, scheduling, and background processing. Express remains the main HTTP/business backend and keeps a coordinated Outbox fallback.

## What it does

- Serves `GET /healthz` for deployment health checks.
- Serves protected maintenance, reporting, Redis-buffer, outbox, admin-export, and sales-insights endpoints. Every internal endpoint requires `Authorization: Bearer <GO_WORKER_TOKEN>`.
- When `GO_WORKER_OUTBOX_ENABLED=true`, runs the primary transactional Outbox consumer in the Go process: atomic claims, 120-second leases, 30-second heartbeat, bounded retries/backoff, dead-letter quarantine, queue health, and processed-event retention. Express automatically resumes polling when the Go status endpoint is unavailable/disabled or pending events include a type not yet allowlisted in Go.
- Rebuilds compact UTC daily analytics rollups in bounded per-day transactions; raw events remain the source of truth and rollup coverage is tracked separately.
- Deletes expired rows from `analytics_events` in bounded batches (default 5,000), using the retention window supplied by Express so fallback semantics remain aligned.
- Uses a process-local fast gate plus a PostgreSQL advisory lock so duplicate requests are rejected immediately and separate Go worker instances cannot overlap the same task.
- Auth-token retention removes expired or used password-reset tokens and expired email-verification tokens in batches of 500. Used email-verification tokens are retained until expiry as a short-lived audit trail.
- Notification retention deletes read notifications older than 90 days in batches of 500, but preserves any notification with an unfinished push dispatch (including dead letters).
- Failed-background-task retention deletes only resolved records whose `resolvedAt` is older than the Express-configured retention window (default 30 days), in batches of 500. Unresolved records and resolved records with a NULL `resolvedAt` are never deleted.
- Daily notification digest groups five low-priority notification types in PostgreSQL, inserts one Arabic digest for each user with at least two eligible rows, and marks only the source rows read in the same atomic SQL statement. Critical notification types are excluded; prior digest rows are excluded. Users are processed in keyset-paginated batches of 100.
- Maintenance and reporting jobs return aggregate metadata only. The sales-insights endpoint returns seller-scoped dashboard metrics; CSV endpoints return only the two explicitly requested export datasets. No auth-token values or internal maintenance row IDs are returned.

## Durable Cloudinary media cleanup queue

Express remains responsible for authenticated uploads, file validation, Cloudinary
transformation presets, and deciding which media assets are no longer referenced.
The upload helpers already apply the project's WebP/resizing presets in Cloudinary;
Go does not duplicate or re-encode those transformations.

When an explicitly identified image, video, or raw asset cannot be deleted inline,
Express inserts its `publicId` and `resourceType` into `media_cleanup_jobs`. Go owns
the primary bounded cleanup pass through `POST /internal/jobs/cleanup-media-assets`:
atomic `SKIP LOCKED` claims, UUID lease tokens, stale-lease recovery, bounded
concurrency, exponential retry (5 minutes to 24 hours), dead-letter quarantine
after 12 attempts, and 30-day pruning of completed queue rows. A failed delete
never removes the associated queue row. Cloudinary `not found` is treated as
success, so retries after ambiguous provider responses are safe.

The worker only deletes IDs already present in the durable queue. It does not
list Cloudinary folders or bulk-delete resources, because those assets may still
be referenced by live ads, products, stories, stores, profiles, or messages.
Message image/audio/raw attachment cleanup is enqueued in the same PostgreSQL
transaction as message soft-delete; raw public IDs retain their file extension.
The Express upload layer continues to validate and upload assets, while
Cloudinary performs the configured upload-time transformations.

The daily Go scheduler also includes `report:cleanup-media-assets`; the dedicated
`.github/workflows/media-cleanup.yml` backstop invokes Go four times per day and
runs the Express/Prisma fallback when Go is unavailable. Both paths share
advisory lock `731904302`.

Apply migration `20261102130000_add_media_cleanup_queue` before deploying the API
and Go worker versions together. Set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
and `CLOUDINARY_API_SECRET` on Go for direct deletion; the Express fallback uses
the same variables already required by API uploads. `GET /internal/media/cleanup/status`
returns aggregate pending/processing/dead counts, and `/internal/diagnostics`
reports the queue migration as `mediaCleanupQueue`. No Cloudinary secret is
returned by either status route.

## Read-only Data Integrity Engine (admin-triggered)

The protected `POST /internal/integrity/scan` endpoint runs a bounded,
read-only, repeatable-read snapshot over 13 fixed consistency checks. The
Express admin route is `POST /admin/data-integrity/scan` and is restricted to
`ADMIN` or higher. The Monitoring Center exposes it as a manual scan; opening
the page does not start a database scan. Concurrent requests from one Express
process share one in-flight scan.

The checks cover: active ads past expiry; open requests past expiry; promotion
status/window/usage drift; promotion/store-product ownership mismatch; negative
stock; zero-stock products still marked available; stock-movement delta
mismatch; missing marketplace-order status timestamps; order seller/store
mismatch; order-item/product-store mismatch; accepted request/offer mismatch;
push-dispatch/notification recipient mismatch; and invalid appointment time
ranges. Each check returns an exact count plus at most 10 stable-ID samples.
No names, emails, phone numbers, addresses, tokens, or free-form user content
are returned. SQL definitions are static and reviewed; the transaction is
explicitly read-only and statements have a 12-second timeout. The HTTP handler
has a 22-second deadline. Any failed check fails the whole scan rather than
returning a partial report.

This first release is deliberately **diagnostic only**: it does not repair,
update, delete, or enqueue records. Findings are signals for an administrator
to review against the source record and business context. The read-only scan endpoint itself reads existing tables; the history layer
introduced in the next section adds its own migrations. It requires the same
`GO_WORKER_URL` and `GO_WORKER_TOKEN` values already used by the API-to-Go integration. The route
is opt-in at the UI level and the panel shows an explicit read-only notice.

## Read-only Fraud Abuse Monitor (moderator-triggered)

The protected `POST /internal/fraud/monitor/scan` endpoint performs one bounded,
read-only, repeatable-read snapshot over the existing `reports`, `users`, and
`fraud_signals` tables. The authenticated Express route is
`POST /admin/fraud/monitor/scan` (MODERATOR+). The admin Fraud page exposes a
manual scan panel and a separate aggregate-only history view; reading the page
loads history but does not launch a scan.

Four conservative patterns are reported: a reporter with at least 8 pending
reports across at least 5 targets in 24 hours; a target with at least 5 distinct
pending reporters whose reports arrived within a two-hour span during the last
6 hours; a user account created in the last 48 hours that filed at least 3
pending reports across distinct targets in the last 24 hours; and a user with
at least 6 unreviewed fraud signals in the last 24 hours. Each result returns
an exact case count and up to 10 samples containing opaque IDs, counts, and
relevant timestamps only. No report notes, contact details, names, or emails
are returned.

These are **review indicators, not proof of abuse**. Multiple fraud signals
may belong to the same listing; a burst of reports may be legitimate; account
age alone is not suspicious. The monitor never creates fraud signals, changes
risk scores, bans accounts, updates report status, or hides content. Any action
remains with the existing Express fraud/reports moderation flows and a human
moderator.

Go is the primary reader through the shared `requestJsonWithGoFallback`
coordinator; when Go is missing, unavailable, times out, or returns an invalid
payload, Express runs the same fixed SQL checks as a read-only fallback. Both
implementations use a repeatable-read snapshot, a 12-second SQL statement
timeout, and at most 10 samples per check. The Go handler has a 22-second
request deadline. A shared transaction-scoped advisory lock (`731904303`) prevents Go and Express
fallback scans from overlapping, including after an ambiguous Go timeout. The supporting report index is added by migration
`20261102143000_add_fraud_monitor_report_index`; apply migrations before
releasing the API/Go version together.

The daily Go scheduler also adds `report:fraud-monitor` (07:45 Asia/Gaza
metadata; invoked by the existing daily GitHub workflow). Go delegates this
allowlisted job to the compiled Express script adapter. The script invokes the
same Go-first scan with the read-only Express fallback and persists the result
in `fraud_monitor_scan_runs` plus four per-check aggregate snapshots. A unique
`scheduledFor` date makes a completed daily scan idempotent across scheduler
retries. Manual scans are also recorded. The history endpoint is
`GET /admin/fraud/monitor/history` (MODERATOR+); it returns the 14 newest runs
and compares the latest two successful snapshots by check code.

History intentionally stores counts and execution metadata only. It never
persists sample user IDs, target IDs, report notes, names, emails, phone numbers,
or listing text. Completed/failed history is retained for 180 days. The daily
job marks abandoned RUNNING rows as failed after 45 minutes and prunes old rows;
child check snapshots are removed by the foreign-key cascade.

The history migration is `20261102150000_add_fraud_monitor_history`; apply it
along with the report index before release. `/internal/diagnostics` now reports
`fraudMonitoring` as ready only when the source tables, report index, and both
history tables are present.

## Environment

- `GO_WORKER_DATABASE_URL` — preferred dedicated connection string. If unset, the worker uses `DIRECT_URL`, then `DATABASE_URL`. Use a direct/session PostgreSQL connection because the worker uses a session-level advisory lock; avoid transaction-pooler URLs for this worker.
- `GO_WORKER_TOKEN` — long random secret, shared with the API service. It protects the worker routes and the Go-to-API scheduler callback.
- `GO_WORKER_API_URL` — HTTPS origin of the Express API, reachable from the Go service (for example `https://marketplat-nz19.onrender.com`). Go uses it for the allowlisted scheduled-job adapter and best-effort post-commit SSE/unread-cache callbacks; do not include a path, query, or credentials.
- `GO_WORKER_OUTBOX_ENABLED` — optional, defaults to `false`. Set to `true` only after the API callback routes are deployed and both services share the same database, Redis cache configuration, and `GO_WORKER_TOKEN`. Go then becomes the primary Outbox poller; Express remains the automatic fallback.
- On the **API service**, set `GO_WORKER_OUTBOX_PRIMARY_ENABLED=true` in the same rollout to allow Express to pause its source-Outbox polling only after the protected Go status endpoint confirms coverage. It defaults to disabled so an optional/sleeping Go service is not polled while idle.
- `GO_WORKER_ADDR` — optional, defaults to `:8081`.
- `ANALYTICS_RETENTION_DAYS` — optional startup default (90). The Express caller sends its validated `retentionDays` on each job, and Go uses that value so the primary and fallback paths share the same policy. Valid range: 1–3650.
- `ANALYTICS_RETENTION_BATCH_SIZE` — optional, defaults to `5000` (valid range: 1–50000).
- `DB_MAX_OPEN_CONNS` — optional, defaults to `2`. For the Outbox background consumer, keep this at `2` or higher so its lease heartbeat can renew ownership while event work is active. When both Go Outbox and Go Push Dispatch are enabled, use at least `4` so their independent leases and database work do not starve one another. If both consumers are disabled, other maintenance jobs can use `1` for the smallest connection footprint.
- `GO_WORKER_REDIS_URL` — preferred Redis URL for the activity/views buffers (`redis://` or `rediss://`). If unset, `REDIS_URL` or `REDIS_HOST` settings are used.
- `GO_WORKER_REDIS_HOST`, `GO_WORKER_REDIS_PORT`, `GO_WORKER_REDIS_USERNAME`, `GO_WORKER_REDIS_PASSWORD`, `GO_WORKER_REDIS_TLS`, `GO_WORKER_REDIS_DB` — optional host/ACL/TLS alternative when a URL is not used. The RESP client uses bounded network timeouts and supports Redis ACL AUTH and TLS.
- `GO_WORKER_CACHE_REDIS_URL` — optional dedicated SWR cache Redis URL (`redis://` or `rediss://`) for `CACHE_GENERATION_BUMP` outbox events. Without it, `REDIS_CACHE_HOST` or the primary Redis config is used. The worker also accepts `GO_WORKER_CACHE_REDIS_HOST/PORT/USERNAME/PASSWORD/TLS` and the API-compatible `REDIS_CACHE_HOST/PORT/USERNAME/PASSWORD/TLS` variables.

## Go-owned transactional Outbox (opt-in)

The Go Outbox worker is disabled by default. After deploying the Go and API
versions together, set `GO_WORKER_OUTBOX_ENABLED=true` on the Go service and
keep `GO_WORKER_URL` plus `GO_WORKER_TOKEN` configured on the API. Go claims
only the four event types implemented in `internal/outboxevents`; if an
unrecognized pending event type appears, the protected status endpoint reports
Go as not eligible and the Express worker keeps consuming the queue. Both
consumers use the same PostgreSQL `SKIP LOCKED` claim and `lockedBy` lease
fields, so a temporary Go outage falls back without introducing a second
independent queue.

Go owns event claiming, the lease heartbeat, retry scheduling, quarantine,
health checks, and pruning of processed Outbox rows. The event transaction
still commits notification rows and durable push-dispatch intents atomically.
Express retains the process-aware Redis/SSE publisher and unread-count cache
invalidation through the bounded internal callback. The Express worker
continues to process source Outbox events whenever Go is unavailable or
explicitly disabled. Its durable push-dispatch consumer is separately
controlled by `GO_WORKER_PUSH_DISPATCH_PRIMARY_ENABLED`; see the Go-owned
Notification Push Dispatch section below. The callback payloads are split by
serialized byte size (40KB maximum per request) to remain below Express's 50KB
JSON parser limit.

The Go service requires `GO_WORKER_API_URL`, `GO_WORKER_TOKEN`, and the same
cache Redis connection used by Express for `CACHE_GENERATION_BUMP`. If these
are missing, Go refuses to start with Outbox enabled rather than claim events
whose post-commit/cache work it cannot complete. No new database migration is
required; existing Outbox and idempotency-ledger tables are reused.

## Go-owned analytics ingestion and summary reads

The public `POST /analytics/events` contract stays in Express: it applies the
existing unauthenticated rate limit and Zod validation, and resolves an
optional verified user ID. Express then sends the bounded batch to Go at
`POST /internal/analytics/events`. Go revalidates the event allowlist, session
IDs, metadata object size, paths/referrers, and batch size before writing to
`analytics_events` in one PostgreSQL statement.

Each client event has a stable `eventId`. Express generates one for older
clients that do not send it. The write path uses a dedicated
`requestJsonWithGoIdempotentFallback` helper (separate from the read-only Go
fallback helper) and a batch idempotency key derived from the sorted event IDs.
That value is used as the existing `analytics_events.id` primary key, so a
successful Go insert with a lost HTTP response can safely fall back to Express
using the same IDs and `createMany(skipDuplicates: true)`. Go does not blindly
retry a write; it invokes the Express fallback once, and the database primary
key is the durable idempotency boundary. The Go request timeout is 1.5 seconds
so a sleeping/unavailable worker does not stall the analytics beacon for the
long timeout used by read-only admin summaries. No schema migration is
required. The browser beacon remains best-effort and still receives the same
HTTP 202 contract even when both writers are unavailable.

The admin-only `GET /admin/analytics/summary` route remains authenticated by
Express. After its existing date-range validation, Express requests
`POST /internal/analytics/summary` from Go. Go computes event totals, trend
buckets, top categories (including category display names), and distinct
session funnels. Date boundaries are normalized to UTC to match Prisma Date
handling, and the two funnel response objects retain the exact three-field
Express contract (including zero values). A bounded 6-second database context
protects the worker; if Go is unavailable, times out, or returns an invalid
payload, Express runs the existing Prisma/SQL summary implementation. Funnel
calculations continue to use distinct session IDs over the whole requested
range and are not approximated by daily sums.

These routes use the existing `GO_WORKER_URL` and `GO_WORKER_TOKEN` API
settings. The daily aggregation phase adds the migration
`20261102100000_add_analytics_daily_rollups`; apply it with
`npx prisma migrate deploy` before the new scheduled job runs. The first
backfill can only aggregate raw rows that still exist at rollout time; it
cannot reconstruct analytics events already deleted by older retention runs.
Go rebuilds up
to 14 missing UTC days per invocation from the configured raw-retention window,
refreshes the latest three completed days, and keeps compact rollups for at
least 400 days. The completion ledger also records zero-event days, so a
summary never mistakes an unprocessed date for an empty date. The raw
`analytics_events` table remains authoritative. Retention removes rows after
the configured `ANALYTICS_RETENTION_DAYS` cutoff only when their UTC date has
completed rollup coverage; uncovered days are temporarily retained during
backfill rather than discarded.

The Go summary uses rollups for fully covered UTC days and reads partial edge
days or days without a completion marker from raw events. Weekly views are
formed by summing daily rollups using PostgreSQL's `date_trunc('week', ...)`;
category totals use the same complete-day/raw-edge combination. Funnels remain
exact `COUNT(DISTINCT sessionId)` queries over raw events because daily distinct
counts cannot be safely summed when a session spans multiple dates. Therefore
historical funnel values older than raw-event retention remain subject to the
same raw-retention limit; the rollups preserve totals, trends, and category
counts, not arbitrary-range distinct-session sets.

`report:analytics-rollup` runs before `report:cleanup-analytics` in both the Go
and Express scheduler definitions. Retention also has a hard safety gate: it
can delete an old raw event inside the active rollup window only when its UTC
date exists in `analytics_rollup_days`. Dates already older than that configured
window remain subject to the raw-retention policy. During the first bounded
backfill (14 missing days per run), deletion is deferred for uncovered dates,
preventing loss of raw events that should be represented by rollups even if
rollup fails or retention runs independently.
When Go is unavailable, the compiled Express adapter uses the same
transaction-scoped PostgreSQL advisory lock and the same backfill/refresh
policy. The same coverage gate is implemented in both retention paths. The
rollup migration is reported as `analyticsRollups` in
`GET /internal/diagnostics`.

## Express fallback integration

Set `GO_WORKER_URL` and `GO_WORKER_TOKEN` in the API environment. Prefer the private Render service URL for calls originating inside Render. The scheduled workflow in `.github/workflows/cron.yml` runs on a GitHub-hosted runner, so its `GO_WORKER_URL` GitHub Actions secret must instead be a public HTTPS worker URL reachable from GitHub (the Bearer token remains required). These may be different URL values in Render and GitHub settings. Leave the workflow secret unset to use the Express fallback from GitHub Actions. The `report:cleanup-analytics`, `report:cleanup-tokens`, `report:cleanup-notifications`, `report:cleanup-failed-tasks`, and `report:notification-digest` scripts try Go first through one shared Express coordinator. If the worker is not configured or fails, the bounded Prisma fallback runs in Express. A `409` means another Go worker already owns that job; Express skips the duplicate run. The existing admin-only `GET /export/users.csv` and `GET /export/reports.csv` routes remain authenticated by Express, then proxy to `/internal/exports/users.csv` or `/internal/exports/reports.csv` on Go. Go streams at most 5,000 rows into a temporary file and starts the HTTP body only after the query completes; on a pre-stream Go failure, Express uses the existing Prisma CSV exporter. If streaming has already begun, Express never attempts a second response. The authenticated seller route `GET /sales/smart-insights` is also kept in Express; after `requireUser`, it sends only that verified `userId` to `/internal/reports/sales-insights`. Go combines the current/previous-period, customer, overdue, low-stock, and top-product aggregations into one PostgreSQL statement, returning the same insights payload. If Go fails or times out (2.5 seconds), the existing `salesInsightsService.get()` runs in Express. Analytics retention uses advisory lock ID `731904281`; token cleanup uses `731904282`. Notification retention uses lock ID `731904283`; failed-background-task retention uses `731904284`; and notification digest uses `731904285`. Each lock ID is shared by the corresponding Go and Express implementation.

If `GO_WORKER_URL` is unset, the existing Express implementations remain active: bounded Prisma fallbacks for maintenance, the current sales-insights service, and the current Prisma CSV exports. The worker is optional and does not become the primary HTTP API.

## Auth-token retention request

The API calls this endpoint with an empty JSON object; the retention cutoff is calculated by Go at execution time.

```sh
curl -i -X POST \
  "$GO_WORKER_URL/internal/jobs/auth-token-retention" \
  -H "Authorization: Bearer $GO_WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{}'
```

A successful response includes aggregate `deleted`, `batches`, `passwordResetDeleted`, and `emailVerificationDeleted` counts. The endpoint never returns token values or row IDs.


## Notification-retention request

The API sends the configured 90-day policy to this endpoint. Only read notifications older than the cutoff are eligible. A notification is retained whenever it has a push dispatch with `processedAt IS NULL`; this includes pending, retryable, leased, and dead-lettered dispatches. This prevents the notification foreign-key cascade from removing push recovery data.

```sh
curl -i -X POST \
  "$GO_WORKER_URL/internal/jobs/notification-retention" \
  -H "Authorization: Bearer $GO_WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"retentionDays":90}'
```

The result contains aggregate `deleted`, `batches`, `cutoff`, and `retentionDays` fields. The bounded batch size is 500. The Express fallback takes the same advisory lock for each transaction-sized batch; a lock conflict skips the fallback rather than racing an active Go run.


## Failed-background-task retention request

The API sends `env.reports.failedTaskRetentionDays` (default 30). Only rows with `resolved = TRUE`, a non-NULL `resolvedAt`, and `resolvedAt` older than the cutoff are eligible. The unresolved backlog remains in PostgreSQL and is summarized by task type after the retention pass.

```sh
curl -i -X POST \
  "$GO_WORKER_URL/internal/jobs/failed-task-retention" \
  -H "Authorization: Bearer $GO_WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"retentionDays":30}'
```

The response contains only aggregate `deleted`, `batches`, `cutoff`, and `retentionDays` fields. The Express fallback uses the same advisory lock, retention predicate, and 500-row batches. The supporting partial index is created by migration `20261030100000_failed_background_task_retention_index`; it is created concurrently and is not represented in `schema.prisma` because this Prisma 5 schema does not model partial indexes.

## Daily notification-digest request

The endpoint accepts only an empty JSON object. Go performs the grouping and writes each digest plus its source-row `readAt` updates atomically in PostgreSQL. It processes 100 users per keyset batch; the Express fallback uses the same SQL and advisory lock. The supporting partial index is created by migration `20261030110000_notification_digest_candidates_index`.

```sh
curl -i -X POST \
  "$GO_WORKER_URL/internal/jobs/notification-digest" \
  -H "Authorization: Bearer $GO_WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{}'
```

The result contains only `digestsCreated`, `rowsMarkedRead`, and `batches`.


### Sales smart-insights report endpoint

- `POST /internal/reports/sales-insights` with `{"userId":"<authenticated-user-id>"}` returns the seller's sales KPIs, 30-day forecast, top products, and Arabic insights.
- The public `/sales/smart-insights` route remains in Express behind its existing authentication middleware. Express never accepts the seller ID from the public request; it forwards `requireUser(req).userId` using the worker Bearer token.
- Go performs the aggregates in one SQL statement and returns at most 10 top products. The request is read-only and uses a 2-second Go query deadline; Express falls back after its 2.5-second worker-call timeout.
- No migration is required; the existing `sale_records(sellerId, soldAt)`, `sale_items(saleId)`, customer, store, product, and seller-profile indexes are used.

Example internal request (do not expose this route to browsers):

```sh
curl -i -X POST \
  "$GO_WORKER_URL/internal/reports/sales-insights" \
  -H "Authorization: Bearer $GO_WORKER_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"userId":"seller-cuid"}'
```


## Go-owned daily scheduler (phase 1)

The daily scheduled-job coordinator is now owned by Go through
`POST /internal/scheduler/run-due`. It calculates due business dates in
`Asia/Gaza`, preserves the existing weekday one-day catch-up behaviour, and
claims/completes/fails rows in the existing `scheduled_job_runs` ledger. The
job list and ordering match `apps/api/src/scripts/runScheduledJobs.ts`.

Go executes `report:analytics-rollup` directly. The other claimed jobs are
usually delegated to the API's private
`POST /internal/go-worker/run-scheduled-job` adapter, which accepts only its
allowlisted names and launches the matching compiled `dist/scripts/*.js`
entrypoint directly. The Express scheduler fallback also has a compiled
`rollupAnalytics.js` adapter. This preserves existing Go-first / bounded
Express fallback behaviour and post-commit effects for delegated jobs. Go does
not accept arbitrary commands or script paths.

Configuration:

- On the **Go Worker** service, set `GO_WORKER_API_URL` to the Express API's
  HTTPS origin reachable from Go (for example,
  `https://marketplat-nz19.onrender.com`), without a path.
- Configure the same `GO_WORKER_TOKEN` on both the Go Worker and API services.
- In GitHub Actions, set `GO_WORKER_URL` to the public HTTPS Go Worker origin
  and `GO_WORKER_TOKEN` to that same secret. The GitHub runner invokes Go first;
  if Go fails, the Express fallback runs and the workflow succeeds only if that
  fallback also succeeds. The Go request is bounded to 45 minutes so the
  workflow retains time to install Node dependencies and run the fallback;
  each delegated job has a 40-minute upper bound.
- The API production build must include `dist/scripts/*.js` (the normal
  `npm run build` output). The adapter returns an error when a mapped script
  is absent; Go records the failure and the workflow can use the Express
  scheduler fallback.

If Go is unreachable, not configured, or reports one or more failed jobs,
`.github/workflows/cron.yml` runs the existing `npm run cron:scheduled` Express
scheduler. Both schedulers use the same PostgreSQL ledger and the existing
75-minute stale-RUNNING reclaim rule, so completed jobs are not repeated and
an actively running job is not claimed twice. No database migration is
required; this uses the existing `scheduled_job_runs` table.

The Express scheduler remains as an operational fallback. Its presence is
intentional, not a second always-on scheduler. Do not add an independent cron
trigger to the API service while GitHub Actions is the configured daily trigger.

## Run locally

```sh
cd apps/go-worker
go mod tidy
go test ./...
DATABASE_URL='postgresql://...' GO_WORKER_TOKEN='replace-with-a-long-random-secret' go run ./cmd/server
```

In another terminal, run the API with `GO_WORKER_URL=http://localhost:8081` and the same token, and run the Go worker with `GO_WORKER_API_URL=http://localhost:4000` (or the API's local origin). To exercise the old Express fallback, leave `GO_WORKER_URL` unset in the API/GitHub runner.

## Operational caveat

This moves selected batch execution, digest aggregation, admin CSV generation, and sales-insights aggregation out of the Express process, reducing Node-side memory and event-loop work. The sales-insights fast path reads at most the same deterministic 5,000 sale-item sample as the Express fallback; both implementations use ascending `createdAt,id` order for that sample. PostgreSQL remains shared with Express on Aiven, so SQL CPU, I/O, locks, and WAL are not offloaded to a separate database. Measure job duration, database CPU, lock waits, and WAL volume before expanding this worker; keep this as a staged rollout rather than moving every scheduled or request-path task at once.

Maintenance jobs run on the same pinned database connection that owns their advisory lock. This also works when `DB_MAX_OPEN_CONNS=1`, avoiding a pool-starvation deadlock while the lock connection is checked out. CSV and sales-insights read requests use the regular bounded connection pool and do not acquire a maintenance-job lock. When the only pool connection is occupied by a job, `/healthz` returns HTTP 200 with `status: busy` instead of causing the hosting platform to restart a healthy long-running worker; it probes PostgreSQL again when a spare connection is available.

### Admin CSV export endpoints

- `GET /internal/exports/users.csv` — streams `users.csv`, capped at 5,000 users.
- `GET /internal/exports/reports.csv` — streams `reports.csv`, capped at 5,000 reports.

Go writes each CSV to a temporary file first. If the DB query or file generation fails before HTTP streaming begins, Express can still return the existing Prisma export. No fallback is attempted after streaming starts, because sending a second CSV body would corrupt the download.

These endpoints are not public API routes. Keep them behind the worker Bearer token; the public admin routes must continue to enforce `requireMinRole(ROLES.ADMIN)` in Express. The worker applies the same column order, descending `createdAt` ordering, 5,000-row limit, CSV escaping, and formula-injection prefix as the Express fallback. CSV output is not cached. The API proxy timeout is 15 seconds; Go cancels export queries after 13 seconds.


## Phase 6 — workload offload and fallback

Phase 6 extends the worker beyond retention and reports. The following routes are protected by the same Bearer token and use the same PostgreSQL advisory-lock IDs in Go and Express:

| Workload | Go endpoint | Frequency / behaviour |
|---|---|---|
| Seller sales CSV export | `POST /internal/exports/sales.csv` | Express authenticates and validates seller filters, then streams a bounded (max 5,000 rows) Go-generated CSV; Express Prisma fallback remains available |
| Weekly ad/store/service view reports | `/internal/jobs/weekly-ad-views`, `/weekly-store-views`, `/weekly-service-views` | scheduled; creates notification + durable push-dispatch and advances exact view snapshots in one transaction |
| Seller response metrics | `/internal/jobs/seller-response-metrics` | scheduled; set-based CTE/UPDATE over the rolling 90-day window |
| Daily sales reminder, overdue debt, overdue installments, weekly sales report | `/internal/jobs/sales-daily-reminder`, `/sales-debt-reminder`, `/sales-overdue-installments`, `/weekly-sales-report` | scheduled; idempotent notification + push-dispatch writes in one transaction |
| User activity buffer flush | `/internal/jobs/activity-buffer-flush` | Express continues appending to Redis every request; Go drains up to 500 entries into PostgreSQL per run |
| Ad views buffer flush | `/internal/jobs/views-buffer-flush` | Express continues INCR/dedup in Redis; Go drains counters in bounded SCAN batches and applies set-based SQL updates |
| Selected transactional outbox events | `/internal/outbox/execute-event` | Go handles `USER_ACTIVITY_RECORD`, `SAVED_SEARCH_MATCH_NOTIFICATION`, `FOLLOWED_ACTIVITY_NOTIFICATION`, and `CACHE_GENERATION_BUMP`; Express still owns leases/heartbeats, unread-cache invalidation for notification events, SSE and provider delivery; Go handles cache-generation invalidation |

Both Redis buffer routes use the primary Redis instance (`GO_WORKER_REDIS_URL` / `REDIS_URL`) and keep request-path Redis writes in Express. Activity rows popped by Go are requeued with an independent, three-second compensation context if PostgreSQL rejects the insert or the driver cannot report affected rows; their stable activity idempotency keys make an ambiguous insert retry safe. This closes the HTTP-cancellation compensation gap, but activity still uses destructive `LPOP`: a hard process crash after the pop and before insert/requeue can lose that batch until a processing-list/ack protocol is implemented. View counters are first moved atomically into `views_buffer:inflight` before the source counters are deleted. Go and Express then apply each staged batch in a PostgreSQL transaction that inserts a unique `view_buffer_flush_batches` receipt alongside the ad increments. The Redis inflight entry is acknowledged only after the DB transaction commits. This makes staged batches recoverable across worker process crashes, ambiguous DB commits, lost HDEL replies, and Go-to-Express fallback, provided Redis itself retains the inflight hash. The no-TTL `views_buffer:inflight` key must be protected from eviction, and the provider's persistence/restart behaviour must be verified. Receipt rows are retained as replay tombstones; do not delete them without a cleanup process that also verifies the corresponding Redis inflight entry is absent. The Express fallback acquires the identical advisory lock, so it cannot overlap a Go process that is still completing after the API HTTP timeout.

The sales notification workflow `.github/workflows/sales-notifications.yml` now triggers hourly; the API script selects jobs using `Asia/Gaza` local time. Configure `GO_WORKER_URL` and `GO_WORKER_TOKEN` in GitHub Actions secrets, using a public HTTPS Go URL reachable from the runner. The Render Express service should use its private service URL when supported.

Go creates the database-side notification handoffs and, behind an explicit feature flag, sends per-device FCM for durable outbox targets and BullMQ `fcm` jobs. Express continues to own the dispatch/delivery ledger, leases, retry scheduling, Web Push, email fallback, and the inline FCM fallback used when the queue is disabled or unavailable. This phase does not move synchronous Search, Search Facets, Home Feed, payment/order/auth flows, or Cloudflare Worker code: these paths are either request-latency-sensitive, share the same PostgreSQL bottleneck, or contain provider/security behaviour that must be migrated as a separately verified design. No Mobile or Cloudflare Worker files are changed.


## Phase 7 — listing and request lifecycle sweeps

Phase 7 offloads two additional scheduled jobs that are database-only or whose
non-database side effects can safely remain owned by Express:

| Workload | Go endpoint | Behaviour |
|---|---|---|
| Expire open marketplace requests | `/internal/jobs/expire-open-requests` | Changes only `OPEN` requests with a non-NULL `expiresAt <= now` to `EXPIRED`, in batches of 1,000. Requests with no expiry and requests already accepted/cancelled are preserved. |
| Demote stale ad boosts | `/internal/jobs/demote-stale-boosts` | Clears `isFeatured` and `isPinned` only for `ACTIVE` ads whose `updatedAt` is older than the API-supplied `staleBoostDays` (default 60), in batches of 1,000. The ad status and other fields are unchanged. Supports the API's `DRY_RUN` setting. |

Both jobs use the Go process-local gate plus session-level PostgreSQL advisory
locks `731904296` (open request expiry) and `731904297` (stale boost demotion).
The Express fallbacks use the same IDs with transaction-scoped advisory locks and
bounded SQL batches. The partial indexes in migration `20261030120000_go_worker_phase7_lifecycle_indexes` support both candidate scans. They are created concurrently and intentionally are not represented in `schema.prisma` because Prisma 5.22 does not model partial indexes.

For stale boost demotion, Express remains responsible for the ads Redis
cache-generation bump and Cloudflare edge purge. The Go-success hook runs only
after a validated successful response; failure of that best-effort hook never
causes Express to repeat the already-committed database job. The Express
fallback performs the same cache refresh after its database batches commit.

The promotion lifecycle and expired-story cleanup are handled by the Go-first
jobs added in Phases 10–11 below. Express retains equivalent SQL/Cloudinary
fallbacks using the same advisory locks. Story cleanup additionally requires
the Go service to receive `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET`; if they are absent, the Go endpoint returns `503` and
Express performs the fallback when its own Cloudinary environment is configured.
The daily GitHub Actions workflow receives the matching Cloudinary secrets for
that fallback path.

## Phase 8 — stale service-request expiry

`POST /internal/jobs/expire-service-requests` moves only service requests with
`status = PENDING` and `createdAt` older than the existing seven-day TTL to
`EXPIRED`. It preserves the `respondedAt IS NULL` system-expiry marker and
rechecks the status/age in the write statement so a concurrently answered
request is not overwritten. Work is bounded to 200 rows per SQL statement and
at most 50 batches per run, matching the former Express ceiling of 10,000 rows.

For customers whose `serviceQuotes` preference allows notifications (missing
preference keys still default to enabled), the same SQL statement also inserts
the `SERVICE_REQUEST_UPDATE` in-app notification and its durable push-dispatch
row. This closes the old crash gap between changing the request status and
creating the notification. Push delivery remains in the existing Express push
worker/provider path. Express performs unread-count invalidation, SSE delivery,
and the existing email-fallback scheduling only after the committed write. If
Go is unavailable, Express runs an equivalent parameterized SQL fallback under
the same advisory lock.

The Go handler and Express fallback share advisory lock `731904298`. The
existing `service_requests(status, createdAt)` index supports the ordered due
scan; no schema migration or new Render environment variable is required. The
scheduled-job entry remains `report:expire-service-requests`.


## Phase 9 — ad expiry warnings and terminal expiry

`POST /internal/jobs/expire-ads` handles the same daily 60-day ad lifecycle as
the former Express script. It first warns eligible `ACTIVE` ads with
`flaggedForReview = FALSE`, a non-null `expiresAt` within the next seven days,
and `expirationNotifiedAt IS NULL`. It then transitions all due `ACTIVE` ads
with `expiresAt <= now` to `EXPIRED` (including flagged ads, matching the old
script). Both paths use ordered, `SKIP LOCKED` batches of 500, with a maximum
of 20 batches per path in one run.

Each warning marker or terminal status change and its matching in-app
notification plus durable push-dispatch row commit atomically. Notification
keys are stable per ad/event to prevent duplicate in-app rows. Express still
performs unread-cache invalidation, SSE and email-fallback scheduling after
commit. After one or more ads become `EXPIRED`, Express also runs the existing
ads/home cache-generation bump followed by the Cloudflare edge purge. A failure
in these post-commit operations is logged and never causes the DB lifecycle
job to be repeated.

The Go handler and Express SQL fallback share advisory lock `731904299`.
There are no new migrations or environment variables. The existing
`report:expire-ads` scheduled entry continues to invoke the same script.


## Phase 10 — promotion lifecycle

`POST /internal/jobs/promotion-lifecycle` now handles all three promotion
transitions: `SCHEDULED -> ACTIVE`, the one-time 24-hour expiry warning, and
`ACTIVE -> EXPIRED`. It preserves the original notification audiences and copy:
owner lifecycle notifications are sent only when the owner's
`notificationPreferences.myPromotions` value is explicitly `true`; missing or
false values do not receive those owner notifications, matching the original
script's raw-SQL check. On the start transition, all store followers receive the same in-app and
durable-push notification, regardless of `storeUpdates`. This deliberately
retains the legacy `myPromotionsExpiring.ts` behavior: its `notifyFollowers`
path did not filter followers by notification preferences.

Each transition and its notifications / durable push-dispatch rows are written
in a single PostgreSQL statement per batch. Stable idempotency keys prevent
re-runs from duplicating owner or follower notifications. The started event
is independent of the owner's preference: store followers still receive it
when the owner has opted out. Batch size is 100, up to 50 batches per
lifecycle phase per run. If the ceiling is reached, the next 15-minute run
continues the backlog.

The Go and Express implementations share advisory lock `731904301`. The
Express script `report:promotion-lifecycle` remains the coordinator and SQL
fallback. `.github/workflows/promotion-lifecycle.yml` runs it every 15 minutes;
configure GitHub Actions secrets `GO_WORKER_URL` and `GO_WORKER_TOKEN` so the
GitHub-hosted runner can reach the public HTTPS Go Worker URL. Keep the Render
Express service's own `GO_WORKER_URL` set to its preferred private worker URL.
The workflow still needs `DATABASE_URL` and `REDIS_URL` for its Express fallback
and post-commit unread-cache / SSE publication. The promotion workflow no longer
needs VAPID or Firebase credentials because provider delivery is handed to the
existing durable notification-push worker.

Migration `20261030130000_go_worker_phase10_lifecycle_indexes` adds three
partial indexes for scheduled starts, active expiry, and active-unwarned
expiry. They use `CREATE INDEX CONCURRENTLY` to avoid blocking writes, so the
migration runner must not wrap this migration in an explicit transaction. Apply
it through the existing Prisma migration deployment before activating this
version. No new secret is introduced for this phase.

## Phase 11 — expired-story media cleanup

`POST /internal/jobs/cleanup-expired-stories` selects expired stories in
`(expiresAt, id)` order and deletes their Cloudinary image before deleting the
story row. A Cloudinary failure leaves the row intact; a database failure after
a successful Cloudinary delete also leaves the row for retry. Cloudinary's
`not found` response is treated as success so the second case is idempotent.
The worker uses the signed Upload API `/image/destroy` request with SHA-1
signature, bounded HTTP timeout, bounded parallel deletion, and a per-run cap
of 300 candidate rows. Story media uploads use the image resource type, so the
cleanup matches the existing `deleteMedia(publicId)` default.

The Go and Express implementations share advisory lock `731904300`. The
existing daily `report:cleanup-stories` entry now calls the Go worker first;
if Go is unavailable or its Cloudinary credentials are missing, Express uses
the existing Cloudinary SDK and the same retry rule. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and
`CLOUDINARY_API_SECRET` as secret environment variables on the Go Worker Render
service. Also add those three GitHub Actions secrets for the daily workflow's
Express fallback; `.github/workflows/cron.yml` passes them only to the scheduled
job process. Use the same account values as the Express Render service. The
daily runner also requires `GO_WORKER_URL` (public HTTPS URL reachable from
GitHub Actions) and `GO_WORKER_TOKEN`. These secrets are never sent to the
browser or written to job logs.

## Production verification still required

Unit tests and static checks do not prove that the SQL runs against the actual
Aiven schema, that the Cloudinary credentials are accepted by the production
account, or that Render has both deployed versions. After applying migration
`20261030130000_go_worker_phase10_lifecycle_indexes`, deploy the Go Worker and
Express API from the same revision, set the three Cloudinary variables on the
Go service, and inspect the job logs. A successful Go response reports
`promotion lifecycle job completed` or `cleanup expired stories job completed`;
Cloudinary failures should increment `mediaDeleteFailed` while keeping the
corresponding story rows for a later retry.

## Opt-in FCM delivery pilot (durable outbox and BullMQ targets)

The Go service can send one FCM delivery target through Firebase HTTP v1 while Express continues to own the durable dispatch and per-device delivery ledger. This is deliberately opt-in and disabled by default.

Configure the Go service with the same Firebase service-account variables already used by the API:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (PEM; literal `\n` sequences are accepted)

Keep the Firebase service-account variables configured in Express while the inline fallback remains active, and install the same three variables on the Go service. Deploy the Go service first, verify its internal route with a real test device, and only then set `GO_WORKER_FCM_PUSH_ENABLED=true` in the Express API environment. The flag defaults to false; leave it false to keep all per-device FCM sends on the existing Firebase Admin SDK path in Express.

When enabled, both FCM targets claimed by the durable `notification_push_dispatches` worker and per-device `fcm` jobs handled by the BullMQ notification worker use `POST /internal/push/fcm/send`. BullMQ still owns its retry schedule. The inline fire-and-forget `notifyUser` fallback (used when the queue is disabled/unavailable) remains Express-owned in this phase. Express sends only `userId`, the opaque `targetId`, and the notification payload. Go loads the current token from `fcm_device_tokens` with both `id` and `userId`; the raw device token and service-account key never cross the Express-to-Go request or appear in logs. The endpoint requires the existing `Authorization: Bearer <GO_WORKER_TOKEN>` internal credential.

Go obtains and caches a short-lived OAuth access token, sends the FCM HTTP v1 message, and returns one of `sent`, `gone`, `transient`, `failed`, `unconfigured`, or `missing`. Only an explicit FCM `UNREGISTERED` response is treated as a dead token. The stale-token cleanup uses a compare-and-delete predicate on the exact token read, so a concurrent token rotation is not deleted. Other permanent provider errors are not mislabeled as invalid tokens.

Express retains dispatch/target leases, retries, backoff, delivery outcomes, and dead-letter handling. A Go transport error or ambiguous timeout is returned to the existing durable retry path; it is **not** followed by an immediate Express send, because Go may already have submitted the message to FCM. FCM delivery therefore remains at-least-once under ambiguous network failures, not exactly-once. Keep the feature flag disabled until Go credentials and a real test device have been verified.


## Go-owned Notification Push Dispatch (opt-in)

The Go worker can own the durable `notification_push_dispatches` queue and its
per-device delivery ledger. This is separate from the source transactional
Outbox: source Outbox events create the notification rows and push-dispatch
intent atomically; the push-dispatch worker then snapshots device row IDs,
claims each target with a lease, delivers one provider target at a time,
persists each outcome, retries transient errors with bounded exponential
backoff, quarantines exhausted parent dispatches, and prunes completed dispatch
rows after 30 days. It reuses the existing `notification_push_dispatches` and
`notification_push_delivery_targets` tables, including the target lease columns
from migration `20261011170000_notification_push_target_leases`; no new database
migration is introduced by this feature.

Configure the Go service with:

- `GO_WORKER_PUSH_DISPATCH_ENABLED=true` to start the Go dispatch loop. It is
  disabled by default.
- `GO_WORKER_API_URL` and `GO_WORKER_TOKEN` so the worker can verify and use the
  authenticated Express provider adapter for Web Push. The worker will keep
  retrying readiness while Express is unavailable, and the API continues to
  consume the queue until Go reports active.
- `DB_MAX_OPEN_CONNS=4` when both `GO_WORKER_OUTBOX_ENABLED` and
  `GO_WORKER_PUSH_DISPATCH_ENABLED` are enabled. This reserves enough pool
  capacity for independent Outbox/dispatch operations and lease heartbeats.
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are
  optional on Go. If the Go service-account key is valid, FCM is sent directly
  from Go. If it is missing or invalid, Go calls the authenticated Express
  adapter, which uses the existing Firebase Admin service and credentials.

On the **API service**, configure `GO_WORKER_URL` and the same
`GO_WORKER_TOKEN`. After deploying both revisions and verifying the Go status
route, set `GO_WORKER_PUSH_DISPATCH_PRIMARY_ENABLED=true`. Express pauses its
own push-dispatch polling only while the protected Go status route returns
`enabled: true`; when Go is disabled, unhealthy, unreachable, or not ready,
Express resumes its existing durable consumer automatically. Both consumers
still use PostgreSQL `FOR UPDATE SKIP LOCKED` and the same lease columns, so a
rolling handoff does not create parallel ownership of a dispatch or target.

Go owns dispatch/target claims, target snapshotting, lease heartbeats, quiet-hour
deferral, retry scheduling, per-target outcome persistence, dead-letter
quarantine, and completed-dispatch retention. FCM is sent directly through the
Go HTTP v1 client when its credentials are valid. Web Push remains on the
existing Express `web-push` implementation because that code owns VAPID signing,
RFC 8030 topic hashing, TTL/urgency options, and endpoint pruning. The Go worker
sends only opaque `userId`/`targetId` values and the bounded payload to the
internal adapter; endpoint URLs, Web Push keys, FCM tokens, and private keys do
not cross the service boundary. When Go does not have valid FCM credentials,
the same adapter uses the existing Express Firebase Admin implementation.

The provider adapter routes are protected by the shared Bearer token and use
strict request allowlists and size limits. Go validates that the dispatch and
target lease schema exists and that the Express adapter is reachable before it
reports itself active. The API status probe is opt-in and short-timeout; a
sleeping or unavailable optional Go service does not receive idle polling unless
the API primary flag is enabled.

Delivery is at-least-once under ambiguous provider/network timeouts: a provider
may accept a push even if the worker loses the response before recording
`SENT`. The durable per-target ledger prevents resending targets already marked
sent, but cannot promise exactly-once delivery across an external provider
boundary. Keep Express provider credentials configured as the fallback path.
The Go poller relinquishes primary status after five consecutive dispatch-claim
failures, causing the protected status endpoint to return `enabled: false` so
Express resumes its local consumer. A bounded two-minute per-dispatch context
also prevents a stuck batch from holding leases indefinitely. The Go process is
not automatically restarted by this circuit breaker; Express remains the
fallback until the worker is restarted or redeployed.
The existing BullMQ notification queue remains Express-owned in this phase;
this Go worker owns only the durable Outbox push-dispatch ledger, not all
fire-and-forget or BullMQ notification flows.

## Operational hardening — Redis buffers, scheduler recovery, and shutdown

The Go worker now handles `SIGTERM`/`SIGINT` by calling `http.Server.Shutdown` with a 20-second deadline. Render deploys therefore allow active jobs to finish and release their session-level PostgreSQL advisory locks before the process exits; only after the deadline does the server force-close remaining connections.

`GET /healthz` remains deliberately database-focused. It returns `busy` while the worker's configured pool is fully occupied rather than allowing Render to restart a worker that is executing a valid long-running job. For dependency diagnostics, call `GET /internal/diagnostics` with the worker Bearer token. It reports PostgreSQL, primary Redis, cache Redis, pool usage, Firebase service-account readiness (`missing`, `invalid`, or `ready`), `view_buffer_flush_batches` / `scheduled_job_runs` / analytics rollup migration readiness, and the optional search-suggestion index state (`fresh`, `stale`, or `missing`). A stale/missing optional suggestion index is not a required-dependency failure because Express falls back to live source queries. The overall diagnostic status is `degraded` if a required dependency or ledger migration is missing/unhealthy. No hosts, credentials, or key material are returned. Redis is optional for database-only Go jobs; `not_configured` is reported distinctly from `unhealthy`.

The daily GitHub Actions scheduler uses the `scheduled_job_runs` table (migration `20261101170000_add_scheduled_job_run_ledger`) to claim each `(jobName, scheduledFor)` once, persist failure state, and skip already-completed jobs. A failed child no longer prevents later due jobs from running; the parent still exits non-zero after the loop so GitHub Actions records the overall run as failed. Failed jobs can be retried by a later invocation, and weekday-restricted jobs can catch up once on the following business day. A `RUNNING` claim is only reclaimed after 75 minutes, longer than the daily workflow's 60-minute timeout. Apply the migration before the first scheduler run after deploying this revision.

### Transactional outbox background process

The transactional outbox poller is an Express/Node background process, separate from the API HTTP process and separate from the Go maintenance HTTP service. The repository contains `src/scripts/runOutboxWorker.ts` and the production command `npm run worker:outbox:prod`; this is intentionally not started by `server.ts`. In Render, configure a **Background Worker** service from the `apps/api` root directory using the same revision and API environment required by Prisma, Redis, push dispatch, and cache invalidation. Build command: `npm ci && npx prisma generate && npm run build`. Start command: `npm run worker:outbox:prod`. Do not use the API web-service start command for this process. Keep exactly one intended outbox service unless deliberately scaling workers; database leases and idempotency protect concurrent consumers, but duplicate service instances still consume DB connections.

Verify after deployment by checking that the process logs `Transactional outbox worker started`, that pending outbox/push-dispatch counts decrease, and that `reportOutboxHealth` continues to report. A configured process is not proof of completed delivery: also inspect retry/dead-letter counts and a test notification's delivery record. The service should have `DATABASE_URL` (and `DIRECT_URL` if required by this project's Prisma config), `REDIS_URL`, and the same provider/cache variables used by its delivery paths. Prefer a worker-specific `DATABASE_URL` with a deliberately small Prisma pool (for example `connection_limit=2&pool_timeout=30`) rather than copying the API service's full pool size; budget all API, Go, and background-worker connections against the database's actual limit. Never create a second copy of Firebase credentials unless the selected Go FCM path is explicitly enabled and the Go service itself is configured.

### View receipt table operations

`view_buffer_flush_batches` is an idempotency ledger, not a disposable cache. Each row represents one uniquely staged batch. It is expected to grow with successful flushes; monitor its row count and disk/index size. Any retention/compaction procedure must preserve receipts for every batch that could still exist in `views_buffer:inflight`, otherwise a delayed replay could double-count views. The current implementation deliberately prioritizes idempotent database replay over automatic receipt deletion. The Redis `views_buffer:inflight` hash has no TTL and must be protected from eviction; verify the provider's persistence/restart behaviour and memory policy before relying on this as crash recovery.

## Go-owned autocomplete suggestion index (opt-in)

The Go worker can refresh a rebuildable PostgreSQL materialized view used by
`GET /search/suggestions`. This is intentionally narrower than the main search
engine: unified full-text search continues to use the existing Arabic-normalized
GIN expression indexes on ads, products, stores, and service listings. PostgreSQL
maintains those GIN indexes automatically as source rows change; duplicating
those documents in a second asynchronously updated index would introduce avoidable
staleness and dual-write risk.

The new `search_suggestions_mv` projection contains active product names, active
store names, active product-category names, and active service-category names.
It keeps the existing source priority (products, stores, product categories,
service categories), stores the same database-defined `arabic_normalize()` form
used by the live query, and has a `text_pattern_ops` B-tree index for prefix
matching. Ads remain excluded from suggestions as before.

Apply Prisma migration
`20261102110000_search_suggestion_materialized_index` before enabling the worker.
The migration creates the materialized view `WITH NO DATA`, so migration time
is bounded. Until the first successful Go refresh, the API automatically uses
the original four live source queries. The first refresh populates the view;
subsequent refreshes use `REFRESH MATERIALIZED VIEW CONCURRENTLY`, so readers
continue seeing the previous committed snapshot while PostgreSQL builds the new
one. Refreshes are guarded by PostgreSQL session advisory lock `731904303` and
run every 10 minutes while the opt-in worker is enabled.

Configure the Go service with `GO_WORKER_SEARCH_INDEX_ENABLED=true` to enable
the refresh loop. It is disabled by default. The protected manual operation is
`POST /internal/jobs/search-index-refresh` with body `{}`; check the protected
`GET /internal/search/index-status` or `GET /internal/diagnostics` for freshness,
row count, refresh duration, and last error. The Go service uses the existing
`GO_WORKER_TOKEN`.

The API uses the projection only while its refresh timestamp is within 30
minutes and not in the future. If it is missing, stale, or the query errors,
Express falls back to the original live SQL queries. The existing Redis and
in-process suggestion caches remain in place. Because Render Free instances can
sleep, the Go refresh loop is not a guaranteed scheduler: the API fallback is
intentional and keeps autocomplete functional when Go is asleep or unavailable.
