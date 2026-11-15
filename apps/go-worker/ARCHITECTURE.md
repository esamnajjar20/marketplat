# Go worker architecture

## Layout

```
cmd/server/            composition root (package main) — wiring only, no business logic
  main.go              process lifecycle: config → DB → server → graceful shutdown
  config.go            env parsing and validation (loadConfig) — unit tested
  database.go          pool setup, DATABASE_URL normalisation
  server.go            server struct, newServer, route table (routes), http.Server settings
  workers.go           long-running consumers (outbox, search index, push dispatch)
  httpx.go             auth, JSON helpers, decodeStrictJSON, decodeRetentionDays
  joblock.go           advisory-lock job runner shared by every write-capable job
  locks.go             advisory-lock IDs (shared with Express — never renumber)
  handlers_*.go        HTTP adapters grouped by concern (health, analytics, retention,
                       jobs, exports, sales, push)
  scheduler.go, outbox_handlers.go, inventory.go, ...   feature adapters (unchanged)
internal/<feature>/    business logic and SQL, one package per job; no HTTP types
```

Rule of thumb: a handler authenticates, validates the body, and delegates to an
`internal/<feature>` package. SQL and batching never live in `cmd/server`.

## Adding a scheduled job

1. Create `internal/myjob` with `Run(ctx, conn, ..., now) (Result, error)` and tests.
2. Add a new unique lock ID in `locks.go` (next free `7319043xx`).
3. Add a handler. For a job with no input:

   ```go
   func (s *server) runMyJob(w http.ResponseWriter, r *http.Request) {
       s.runLockedSQLJob(w, r, myJobLockID, "my job", func(ctx context.Context, conn *sql.Conn) (any, error) {
           return myjob.Run(ctx, conn, time.Now().UTC())
       })
   }
   ```

   For a job with a body, authenticate, parse with `decodeStrictJSON`, then call
   `s.executeLockedJob(w, r, lockedJob{...})`.
4. Register the route in `server.routes()` and add auth/body tests next to the others.

## Job locking contract

`executeLockedJob` = local in-process gate → dedicated connection → `pg_try_advisory_lock`
→ run with deadline → unlock **before** responding → close. Releasing before the response
means an Express fallback triggered by a failed response cannot overlap the job's last
batch. If unlock fails the connection is discarded so the lock cannot leak back into the pool.

## Shutdown

SIGTERM/SIGINT → cancel background workers → `http.Server.Shutdown` (20 s) → wait for
workers (15 s). The process now waits for `Shutdown` to finish, so in-flight jobs are not
cut off while holding an advisory lock.
