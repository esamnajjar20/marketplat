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
| Weekly ad/store/service view reports | `/internal/jobs/weekly-ad-views`, `/weekly-store-views`, `/weekly-service-views` | scheduled; creates notification + durable push-dispatch and advances exact view snapshots in one transaction |
| Seller response metrics | `/internal/jobs/seller-response-metrics` | scheduled; set-based CTE/UPDATE over the rolling 90-day window |
| Daily sales reminder, overdue debt, overdue installments, weekly sales report | `/internal/jobs/sales-daily-reminder`, `/sales-debt-reminder`, `/sales-overdue-installments`, `/weekly-sales-report` | scheduled; idempotent notification + push-dispatch writes in one transaction |
| User activity buffer flush | `/internal/jobs/activity-buffer-flush` | Express continues appending to Redis every request; Go drains up to 500 entries into PostgreSQL per run |
| Ad views buffer flush | `/internal/jobs/views-buffer-flush` | Express continues INCR/dedup in Redis; Go drains counters in bounded SCAN batches and applies set-based SQL updates |
| Selected transactional outbox events | `/internal/outbox/execute-event` | Go handles `USER_ACTIVITY_RECORD`, `SAVED_SEARCH_MATCH_NOTIFICATION`, `FOLLOWED_ACTIVITY_NOTIFICATION`, and `CACHE_GENERATION_BUMP`; Express still owns leases/heartbeats, unread-cache invalidation for notification events, SSE and provider delivery; Go handles cache-generation invalidation |

Both Redis buffer routes use the primary Redis instance (`GO_WORKER_REDIS_URL` / `REDIS_URL`) and keep the request-path Redis writes in Express. If a Go flush fails at the DB stage, drained activity rows are requeued and drained view counters are restored. The Express fallback acquires the identical advisory lock, so it cannot overlap a Go process that is still completing after the API HTTP timeout.

The sales notification workflow `.github/workflows/sales-notifications.yml` now triggers hourly; the API script selects jobs using `Asia/Gaza` local time. Configure `GO_WORKER_URL` and `GO_WORKER_TOKEN` in GitHub Actions secrets, using a public HTTPS Go URL reachable from the runner. The Render Express service should use its private service URL when supported.

Go creates the database-side notification handoffs; Express continues delivering Web Push and FCM through its existing provider libraries, retries, device target leases, and delivery ledger. BullMQ fan-out and email fallback processors remain Express-owned. This phase does not move synchronous Search, Search Facets, Home Feed, payment/order/auth flows, or Cloudflare Worker code: these paths are either request-latency-sensitive, share the same PostgreSQL bottleneck, or contain provider/security behaviour that must be migrated as a separately verified design. No Mobile or Cloudflare Worker files are changed.

