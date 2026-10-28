# MarketPlat Go Worker (pilot)

This is an optional, separately deployable Go worker for the existing analytics-retention maintenance task. Express remains the main backend and keeps the original implementation as a fallback.

## What it does

- Serves `GET /healthz` for deployment health checks.
- Serves `POST /internal/jobs/analytics-retention`, protected by `Authorization: Bearer <GO_WORKER_TOKEN>`.
- Deletes expired rows from `analytics_events` in bounded batches (default 5,000), using the retention window supplied by Express so fallback semantics remain aligned.
- Uses a PostgreSQL advisory lock so two Go worker instances do not run this task simultaneously.
- Returns only aggregate job metadata; it does not expose analytics payloads or row IDs.

## Environment

- `GO_WORKER_DATABASE_URL` — preferred dedicated connection string. If unset, the worker uses `DIRECT_URL`, then `DATABASE_URL`. Use a direct/session PostgreSQL connection because the worker uses a session-level advisory lock; avoid transaction-pooler URLs for this worker.
- `GO_WORKER_TOKEN` — long random secret, shared with the API's scheduled job environment.
- `GO_WORKER_ADDR` — optional, defaults to `:8081`.
- `ANALYTICS_RETENTION_DAYS` — optional startup default (90). The Express caller sends its validated `retentionDays` on each job, and Go uses that value so the primary and fallback paths share the same policy. Valid range: 1–3650.
- `ANALYTICS_RETENTION_BATCH_SIZE` — optional, defaults to `5000` (valid range: 1–50000).
- `DB_MAX_OPEN_CONNS` — optional, defaults to `2`.

## Express fallback integration

Set `GO_WORKER_URL` and `GO_WORKER_TOKEN` in the API environment. The existing `report:cleanup-analytics` script will try Go first. If the Go worker is not configured or fails, the original Prisma cleanup runs in Express. A `409` means another Go worker currently owns the task; Express skips that duplicate run.

If `GO_WORKER_URL` is unset, the deployment behaves exactly as before.

## Run locally

```sh
cd apps/go-worker
go mod tidy
go test ./...
DATABASE_URL='postgresql://...' GO_WORKER_TOKEN='replace-with-a-long-random-secret' go run ./cmd/server
```

In another terminal, the API's original fallback can be exercised by leaving `GO_WORKER_URL` unset. To try the Go path, configure `GO_WORKER_URL=http://localhost:8081` and the same token for the API process.

## Operational caveat

This moves maintenance execution out of the Express process; it does not make PostgreSQL deletes intrinsically faster. Measure job duration, database CPU, lock waits, and WAL volume before deciding whether to keep the separate worker. Keep this as a pilot rather than moving all scheduled tasks at once.

The worker runs the batch statements on the same pinned database connection that owns the advisory lock. This also works when `DB_MAX_OPEN_CONNS=1`, avoiding a pool-starvation deadlock while the lock connection is checked out.
