# Classifieds Platform Backend

A production-ready classifieds platform API (إعلانات مبوبة) built with Node.js, TypeScript, Prisma, PostgreSQL and Redis.

## Tech Stack

- **Runtime**: Node.js + TypeScript
- **Framework**: Express
- **ORM**: Prisma (PostgreSQL)
- **Cache / Token Store**: Redis
- **Auth**: JWT (access + refresh tokens) + JTI blacklisting + rotating refresh tokens
- **Images**: Cloudinary (multiple images per ad, up to 10)
- **Validation**: Zod
- **Testing**: Jest + Supertest
- **Docs**: Swagger / OpenAPI

## Modules

| Module | Description |
|--------|-------------|
| `auth` | Register, login, refresh token, logout, logout-all, Google OAuth ("Continue with Google" — see [`docs/GOOGLE_OAUTH.md`](docs/GOOGLE_OAUTH.md)) |
| `users` | Profile management, avatar upload |
| `ads` | CRUD ads, image upload, view counter, soft delete |
| `categories` | Hierarchical categories (parent/child) |
| `favorites` | Save / unsave ads (toggle) |
| `search` | Full-text search with city, category, price filters |
| `reports` | Report ads (SCAM, FAKE, OFFENSIVE, SPAM) |

## API Endpoints

### Ads
```
GET    /api/v1/ads                    # List ads (public, filterable)
GET    /api/v1/ads/me                 # My ads (auth required)
GET    /api/v1/ads/:id                # Ad detail + increments views
POST   /api/v1/ads                    # Create ad with images
PATCH  /api/v1/ads/:id                # Update ad
POST   /api/v1/ads/:id/images         # Add images to ad
DELETE /api/v1/ads/:id/images         # Remove specific image
DELETE /api/v1/ads/:id                # Soft delete ad
```

### Filters (GET /api/v1/ads)
```
?city=الرياض
?categoryId=<id>
?minPrice=100&maxPrice=5000
?search=iPhone
?page=1&limit=20
```

### Favorites
```
GET    /api/v1/favorites              # My saved ads
POST   /api/v1/favorites/:adId        # Toggle favorite (add/remove)
```

### Search
```
GET    /api/v1/search?q=<term>        # Full-text search
```

### Reports
```
POST   /api/v1/reports/ads/:adId      # Report an ad
```
Reason must be one of: `SCAM` | `FAKE` | `OFFENSIVE` | `SPAM`

## Setup

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Fill in DATABASE_URL, JWT secrets, Redis, Cloudinary

# Run migrations
npx prisma migrate dev

# Start development
npm run dev
```

> **Running on Android (Termux + proot Ubuntu)?** Use `docs/TERMUX_SETUP.md`
> and `.env.termux.example` instead of the steps above — real Postgres +
> Redis running natively on-device (no Docker), plus the ARM64-specific
> Prisma `binaryTargets` note and a boot-retry fix for Postgres/Redis not
> being up yet when the server starts.

> **Note on migrations (FIX DEPLOY-01):** `prisma/migrations/20230101000000_baseline`
> creates every base table — it exists because this project previously had
> no migration doing so at all (every other migration only ever ALTERs
> something), which made `prisma migrate deploy` fail outright on any
> genuinely fresh database. Fresh setups (new dev machine, new CI run, new
> environment) need no special handling — `prisma migrate dev` / `migrate
> deploy` just works. If you're migrating an **existing** database that was
> set up before this fix (schema present via `prisma db push`, no
> migrations history), baseline it onto this migration first, without
> re-running it:
> ```bash
> npx prisma migrate resolve --applied 20230101000000_baseline
> ```
> then continue with `prisma migrate deploy` as normal.

## Docker

```bash
docker compose -f docker-compose.dev.yml up
```

## Observability

`GET /metrics` exposes Prometheus-format metrics: default Node.js
process metrics (CPU, memory, event loop lag, GC — via `prom-client`'s
`collectDefaultMetrics`, prefixed `app_`) plus two custom metrics:

- `http_requests_total{method,route,status_code}` — request count
- `http_request_duration_seconds{method,route,status_code}` — latency histogram

`route` is the matched Express pattern (e.g. `/ads/:id`), not the raw
URL, so per-resource IDs never become label values.

Like `/health`/`/ready`/`/live`, this endpoint is registered before the
API rate limiter and has no authentication — the same as any standard
Prometheus scrape target. If this API is reachable from the public
internet rather than only from an internal scraper, put `/metrics`
behind a network-level allowlist (nginx/ingress rule, security group,
etc.) rather than relying on obscurity — it doesn't leak secrets, but
it does reveal the app's internal route structure and traffic shape.

## Future Modules (Planned)

- `notifications` — Push / in-app notifications
- `chats` — Real-time messaging between users
- `businesses` — Business pages with reviews
- Monetization: featured ads, boost, pin-to-top

## Known Technical Debt (Deliberately Deferred)

Tracked here rather than silently left for someone to rediscover later:

- **`jest.config.ts`'s `coverageThreshold` (70/65/70/70) has not been
  confirmed against a real `npm test -- --coverage` run.** It was set
  based on the fact that every module under `src/modules/*` has both a
  unit test file and an integration test file already — a reasonable
  basis for the number, but not the same as having actually seen the
  real percentage. Run coverage once for real before relying on CI
  going green here; if the real number comes in under threshold, that
  itself is useful signal about which files' tests are thinner than
  they look from file-count alone (a service file can have a test file
  and still only exercise its happy path).

- **Sentry integration exists (`src/instrument.ts`) but has not been
  verified against a real Sentry project.** Set `SENTRY_DSN` (see
  `.env.example`) to enable it — the app works identically without it
  set, this is purely opt-in. The integration logic itself (does the
  Winston transport correctly call `captureException` vs.
  `captureMessage`, does it correctly detect an Error nested in
  `{ err }`-style metadata — the actual convention most of this
  codebase's `logger.error(...)` calls use) is covered by
  `tests/unit/logger.test.ts` against a mocked `@sentry/node`, but no
  one has confirmed a real error actually shows up correctly in an
  actual Sentry dashboard end-to-end. Do that once before relying on
  it in a real incident.

- **Backup restore verification and off-host storage now exist but are
  not yet confirmed against a real environment.**
  `scripts/verify-backup-restore.sh` actually restores the latest
  `db_backup` dump into a disposable Postgres container and checks the
  result (scheduled weekly via
  `.github/workflows/verify-backup-restore.yml`); its pure file-finding
  logic (`scripts/lib/find-latest-backup.sh`) has real, passing tests
  (`scripts/__tests__/find-latest-backup.test.sh`) that don't need
  Docker to run, but the actual restore-into-a-container steps have
  only been exercised up to the point where Docker itself would take
  over — no Docker daemon was available to run it fully in the
  environment this was authored in. `docker-compose.yml`'s new
  `db_backup_offsite_sync` service (opt-in via `BACKUP_OFFSITE_BUCKET`)
  syncs backups to S3-compatible storage, similarly unverified against
  a real bucket. Do one real end-to-end dry run of both — a real
  restore and a real off-host sync — before treating either as
  confirmed disaster-recovery coverage.

- **Pagination is OFFSET-based** (`skip`/`take`), capped at page 1000 /
  limit 100 to bound worst-case query cost. Fine at current scale;
  `OFFSET` cost grows with page depth on Postgres regardless of
  indexing. If the `ads` table grows large enough for deep pagination
  to matter in practice, migrate the ads-listing endpoints to
  cursor-based (`WHERE id > :lastId ORDER BY id LIMIT :n`) pagination —
  this is a breaking API change for any consumer of `page`/`limit`, so
  it needs a deliberate version bump, not a silent swap.
- **Load-testing scripts exist but have not yet been run against a real
  deployment.** See `load-tests/` (k6) — covers `GET /ads`, `GET
  /ads/search`, `POST /auth/login` (specifically the rate limiter's
  concurrency correctness), `POST /ads`, and a targeted probe for the
  PM2-cluster × Prisma-pool-size vs. Postgres `max_connections`
  capacity question raised in `capacityCheck.ts`'s boot-time warning.
  These scripts were written by reasoning carefully through the actual
  code paths (query shapes, indexes, rate limits, connection pooling)
  rather than executed — "the script correctly targets the real
  bottleneck" and "we've confirmed this deployment handles the load"
  are still different claims until someone actually runs
  `k6 run load-tests/scenarios/browsing.js` (etc.) against a real
  environment and looks at the numbers. See `load-tests/README.md` for
  prerequisites and how to interpret results.
