# MarketPlat Go Worker (pilot)

This is an optional, separately deployable Go maintenance worker. Express remains the main backend and keeps bounded implementations as fallbacks.

## What it does

- Serves `GET /healthz` for deployment health checks.
- Serves protected maintenance, reporting, Redis-buffer, outbox, admin-export, and sales-insights endpoints. Every internal endpoint requires `Authorization: Bearer <GO_WORKER_TOKEN>`.
- Deletes expired rows from `analytics_events` in bounded batches (default 5,000), using the retention window supplied by Express so fallback semantics remain aligned.
- Uses a process-local fast gate plus a PostgreSQL advisory lock so duplicate requests are rejected immediately and separate Go worker instances cannot overlap the same task.
- Auth-token retention removes expired or used password-reset tokens and expired email-verification tokens in batches of 500. Used email-verification tokens are retained until expiry as a short-lived audit trail.
- Notification retention deletes read notifications older than 90 days in batches of 500, but preserves any notification with an unfinished push dispatch (including dead letters).
- Failed-background-task retention deletes only resolved records whose `resolvedAt` is older than the Express-configured retention window (default 30 days), in batches of 500. Unresolved records and resolved records with a NULL `resolvedAt` are never deleted.
- Daily notification digest groups five low-priority notification types in PostgreSQL, inserts one Arabic digest for each user with at least two eligible rows, and marks only the source rows read in the same atomic SQL statement. Critical notification types are excluded; prior digest rows are excluded. Users are processed in keyset-paginated batches of 100.
- Maintenance and reporting jobs return aggregate metadata only. The sales-insights endpoint returns seller-scoped dashboard metrics; CSV endpoints return only the two explicitly requested export datasets. No auth-token values or internal maintenance row IDs are returned.

## Environment

- `GO_WORKER_DATABASE_URL` — preferred dedicated connection string. If unset, the worker uses `DIRECT_URL`, then `DATABASE_URL`. Use a direct/session PostgreSQL connection because the worker uses a session-level advisory lock; avoid transaction-pooler URLs for this worker.
- `GO_WORKER_TOKEN` — long random secret, shared with the API's scheduled job environment.
- `GO_WORKER_ADDR` — optional, defaults to `:8081`.
- `ANALYTICS_RETENTION_DAYS` — optional startup default (90). The Express caller sends its validated `retentionDays` on each job, and Go uses that value so the primary and fallback paths share the same policy. Valid range: 1–3650.
- `ANALYTICS_RETENTION_BATCH_SIZE` — optional, defaults to `5000` (valid range: 1–50000).
- `DB_MAX_OPEN_CONNS` — optional, defaults to `2`. For the current small Aiven PostgreSQL tier, start with `1` to minimize connection pressure; write jobs run on their pinned lock connection.
- `GO_WORKER_REDIS_URL` — preferred Redis URL for the activity/views buffers (`redis://` or `rediss://`). If unset, `REDIS_URL` or `REDIS_HOST` settings are used.
- `GO_WORKER_REDIS_HOST`, `GO_WORKER_REDIS_PORT`, `GO_WORKER_REDIS_USERNAME`, `GO_WORKER_REDIS_PASSWORD`, `GO_WORKER_REDIS_TLS`, `GO_WORKER_REDIS_DB` — optional host/ACL/TLS alternative when a URL is not used. The RESP client uses bounded network timeouts and supports Redis ACL AUTH and TLS.
- `GO_WORKER_CACHE_REDIS_URL` — optional dedicated SWR cache Redis URL (`redis://` or `rediss://`) for `CACHE_GENERATION_BUMP` outbox events. Without it, `REDIS_CACHE_HOST` or the primary Redis config is used. The worker also accepts `GO_WORKER_CACHE_REDIS_HOST/PORT/USERNAME/PASSWORD/TLS` and the API-compatible `REDIS_CACHE_HOST/PORT/USERNAME/PASSWORD/TLS` variables.

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

## Run locally

```sh
cd apps/go-worker
go mod tidy
go test ./...
DATABASE_URL='postgresql://...' GO_WORKER_TOKEN='replace-with-a-long-random-secret' go run ./cmd/server
```

In another terminal, the API's original fallback can be exercised by leaving `GO_WORKER_URL` unset. To try the Go path, configure `GO_WORKER_URL=http://localhost:8081` and the same token for the API process.

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

Both Redis buffer routes use the primary Redis instance (`GO_WORKER_REDIS_URL` / `REDIS_URL`) and keep the request-path Redis writes in Express. If a Go flush fails at the DB stage, drained activity rows are requeued and drained view counters are restored. The Express fallback acquires the identical advisory lock, so it cannot overlap a Go process that is still completing after the API HTTP timeout.

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
