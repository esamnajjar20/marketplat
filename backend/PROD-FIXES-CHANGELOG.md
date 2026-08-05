# Production Readiness Fixes — Backend (backend-v9)

> **TERMUX-FIX-01 update:** item #5 below (`bcryptjs` → `bcrypt`) has
> since been **reversed** to support running on Termux/Android with
> Node 24, where `bcrypt`'s native build cannot compile. See
> `src/shared/utils/hash.ts`'s own comment and the "Dependency changes"
> section at the end of this file for the current rationale. The row
> below is left as-is for historical record of the original audit fix.

This documents the fixes applied following the Production Readiness
audit dated 2026-07-12. Each entry corresponds to a numbered item from
that audit's "أهم 20 تحسينًا" (top 20 priorities) list. Search the
codebase for the `PROD-FIX-NN` tag in each entry to find the exact
lines changed and the full reasoning inline.

| # | Priority (from audit) | Status | Files |
|---|---|---|---|
| 1 | CI: run test/lint/type-check on every push/PR | ✅ Done | `.github/workflows/ci.yml` (new) |
| 2 | Explicit timeouts on Cloudinary + SMTP calls | ✅ Done | `src/config/cloudinary.ts`, `src/shared/utils/emailService.ts` |
| 3 | Protect `/metrics` | ✅ Done (app-level; see also #16) | `src/config/env.ts`, `src/shared/utils/metrics.ts`, `.env.example`, `docker-compose.yml`, `tests/unit/metrics.test.ts` |
| 4 | `connection_limit` vs Postgres `max_connections` | ✅ Done | `docker-compose.yml`, `src/shared/utils/capacityCheck.ts`, `.env.example`, `tests/unit/capacityCheck.test.ts` |
| 5 | Replace `bcryptjs` with native `bcrypt` | ✅ Done | `src/shared/utils/hash.ts`, `package.json`, `Dockerfile`, `.github/workflows/ci.yml` |
| 6 | Actually run the test suite in CI | ✅ Done (same as #1) | `.github/workflows/ci.yml` |
| 7 | Actually run Playwright E2E | ✅ Infra done, needs `BACKEND_REPO` set | `marketplace-v10/.github/workflows/ci.yml` (`e2e` job) |
| 8 | Actually run k6 load tests | ✅ Infra done (manual dispatch), no live run performed here | `.github/workflows/load-test.yml` (new) |
| 9 | Migration race on multi-replica deploys | ✅ Done (opt-out flag) | `docker-entrypoint.sh`, `.env.example` |
| 10 | Sentry not enforced in production | ✅ Done (boot-time warning, non-blocking) | `src/server.ts` |
| 11 | Redis `noeviction` risk | ✅ Done — real monitoring, not just review | `src/shared/utils/redisMemoryMonitor.ts` (new), `src/server.ts`, `src/shared/utils/metrics.ts`, `docker-compose.yml`, `tests/unit/redisMemoryMonitor.test.ts` (new) |
| 12 | Circuit breaker for external calls | ✅ Done — real circuit breaker, not just a timeout | `src/shared/utils/circuitBreaker.ts` (new), `src/config/cloudinary.ts`, `src/shared/errors/ServiceUnavailableError.ts` (new), `tests/unit/circuitBreaker.test.ts`, `tests/unit/cloudinary.circuitBreaker.test.ts`, `tests/unit/error.middleware.test.ts` (all new/updated) |
| 13 | Retry with backoff for critical async ops | ✅ Done (email only — see note below) | `src/shared/utils/emailService.ts`, `tests/unit/emailService.test.ts` |
| 14 | Expand E2E coverage (favorites/notifications/etc.) | ✅ Favorites done, others still open | `marketplace-v10/e2e/tests/favorites.spec.ts` (new), `marketplace-v10/e2e/helpers/ads.ts` (new) |
| 15 | `refreshToken` in `localStorage` vs httpOnly cookie | ✅ Done | Backend: `src/shared/utils/authCookies.ts` (new), `src/middlewares/csrf.middleware.ts` (new), `src/modules/auth/auth.controller.ts`, `src/routes.ts`, `src/app.ts`, `package.json` (cookie-parser). Frontend: `store/auth.store.ts`, `types/auth.types.ts`, `api/client.ts`, `api/auth.api.ts`, `lib/csrf.ts` (new), `providers/AuthHydrationProvider.tsx`. Tests updated across both repos — see "Notes" below. |
| 16 | Reference reverse-proxy config | ✅ Done | `nginx/nginx.conf.example` (new) |
| 17 | Standalone smoke test | ✅ Done | `src/scripts/smokeTest.ts` (new), `package.json`, `marketplace-v10/.github/workflows/ci.yml` |
| 18 | Architecture doc beyond README | ⏸ Not done in this pass | — |
| 19 | Stress test for concurrent max-size uploads | ✅ Done | `load-tests/scenarios/max-payload-upload.js` (new), `load-tests/README.md` |
| 20 | Periodic re-check of `capacityCheck.ts` assumptions | ✅ Done (docs updated to match #4's new baseline) | `.env.example`, `src/shared/utils/capacityCheck.ts` |

## Notes on items closed in this second pass

**#11 (Redis `noeviction`):** the `noeviction` policy itself is unchanged
(still the correct choice — see `docker-compose.yml`'s own comment: every
key here carries an explicit TTL, so an LRU policy wouldn't actually
distinguish "safe to drop" from "must not drop" either). What's new is
`shared/utils/redisMemoryMonitor.ts`, which polls `INFO memory` every 30s,
exposes `redis_memory_used_bytes`/`redis_memory_max_bytes` on `/metrics`
for real alerting, and logs a warning once usage crosses 80% of
`maxmemory`. This turns the tradeoff from "documented but unmonitored"
into "documented and observable."

**#12 (Circuit breaker):** implemented as a small, dependency-free
`CircuitBreaker` class (`shared/utils/circuitBreaker.ts`) rather than a
library like `opossum` — no network access to install new packages in
this environment, and the core state machine (CLOSED/OPEN/HALF_OPEN) is
genuinely small enough to hand-roll and keep readable. Wired into
`config/cloudinary.ts` with two independent breakers (upload vs. delete,
since a failure pattern in one shouldn't block the other) — 5 consecutive
failures trips the circuit OPEN for 30s, after which one trial call is
allowed through (HALF_OPEN). An open circuit now surfaces as a 503
`ServiceUnavailableError` to callers instead of either hanging or
returning a generic 500. Deliberately NOT applied to email — retry-with-
backoff (#13) already covers that dependency, and a breaker plus a retry
on the same call would be redundant.

**#13 (Retry):** applied to email sending only (2 retries, short
backoff, bounded total added latency ~2s). Deliberately NOT applied to
Cloudinary uploads — see #12's note above (a circuit breaker, not a
retry, is the right tool there).

**#15 (refreshToken storage):** implemented in full. Backend:
`refreshToken` is now set as an httpOnly, `sameSite=lax` cookie scoped
to `/api/v1/auth` (`shared/utils/authCookies.ts`) and stripped from
every JSON response body; a matching CSRF token is issued in a
separate, non-httpOnly cookie and enforced via a double-submit-cookie
middleware (`middlewares/csrf.middleware.ts`) that only activates when
a `csrfToken` cookie is actually present on the request — this is the
detail that keeps every existing Bearer-token-only client (this repo's
own integration test suite included) working unmodified, since CSRF as
an attack class only exists for cookie-authenticated requests in the
first place. Frontend: `refreshToken` removed from the auth store and
`AuthTokens` type entirely; `AuthHydrationProvider` now always attempts
`/auth/refresh` on load (it can no longer check client-side whether a
session exists, since the cookie is invisible to JS by design) rather
than only when a persisted token was found. `api/client.ts`'s
`withCredentials` was already `true`; it now also echoes the CSRF
cookie back as an `X-CSRF-Token` header on state-changing requests.
Every affected test file in both repos (8 in the frontend, 6 in the
backend) was updated or extended — see each file's own `PROD-FIX-15`
comments for the specific reasoning.

**#18 (Architecture doc):** not produced in this pass — out of scope
for a code-focused fix pass; better handled as a deliberate writing
task with the team's input on what should be documented, not something
to auto-generate.

## New environment variables (see `.env.example` for full docs)

- `METRICS_TOKEN` (optional) — protects `GET /metrics`.
- `RUN_MIGRATIONS_ON_BOOT` (optional, default `true`) — set to `false`
  for multi-replica deployments once migrations are moved to a
  separate one-shot deploy step.

## New scripts

- `npm run smoke-test` — see `src/scripts/smokeTest.ts`.
- k6: `load-tests/scenarios/max-payload-upload.js`.

## Dependency changes

- **TERMUX-FIX-01 (current):** `bcrypt` (native) → `bcryptjs` (pure JS),
  reversing PROD-FIX-05 below, to support Termux/Android + Node 24
  where `bcrypt`'s native build toolchain isn't available. Same hash
  format ($2a$/$2b$), no data migration needed. See
  `src/shared/utils/hash.ts` for the full rationale and trade-offs.
- ~~`bcryptjs` → `bcrypt` (native). Same hash format ($2a$/$2b$), no data
  migration needed. Requires a C++ build toolchain at install time (now
  present in `Dockerfile` and `.github/workflows/ci.yml`) — see
  `Dockerfile`'s own comment if building outside Docker/CI.~~
  (PROD-FIX-05, superseded by TERMUX-FIX-01 above.)
- `cookie-parser` (new, #15) — parses the `refreshToken`/`csrfToken`
  cookies into `req.cookies`. No build-time toolchain requirement
  (pure JS), same as `bcryptjs` above.

## Breaking API change (#15)

`POST /api/v1/auth/register`, `/login`, and `/refresh` no longer return
`refreshToken` in the JSON response body — it is set directly as an
httpOnly cookie instead. `POST /api/v1/auth/refresh` no longer reads
`refreshToken` from the request body at all (a request body is not
required); the cookie is the only source read. Any client other than
`marketplace-v10` (already updated in this same fix) integrating
directly against these three endpoints needs to switch to
cookie-based auth (`withCredentials`/`credentials: 'include'` on every
request) to keep working.

## Post-implementation audit — real bugs found and fixed

After the fixes above were implemented, a dedicated audit pass went
back through every new/changed file specifically hunting for bugs —
not re-reviewing the design decisions, just verifying the code
actually does what it claims. This found and fixed several real
issues:

1. **CircuitBreaker race condition** (`shared/utils/circuitBreaker.ts`):
   concurrent callers arriving in the same tick right as `resetTimeoutMs`
   elapsed could ALL become "trial calls" in HALF_OPEN state, contradicting
   the class's own documented contract ("allow exactly one trial call
   through"). Fixed with a `halfOpenTrialInFlight` guard exploiting JS's
   single-threaded execution model (no real mutex needed). New regression
   test exercises genuinely concurrent `execute()` calls (no `await`
   between them) to catch this — every other test in that file awaits
   sequentially and would never have caught it.

2. **k6 max-payload-upload.js sent only 1 file instead of 5** — passing
   an array of `http.file()` results as a body field value
   (`{ images: files }`) does not work in k6's plain `http.post()` body
   handling (confirmed via k6's own GitHub issue tracker: it either
   merges into one object or silently sends only the last file). This
   would have silently undermined the entire point of the script — it
   claimed to test 5 concurrent files per request but was actually
   sending 1, with no visible error. Fixed using the `FormData` helper
   from `jslib.k6.io`, k6's own documented approach for multi-file
   uploads under the same field name.

3. **E2E CI polled `/health` instead of `/ready`** before proceeding to
   seed data and run Playwright — `/health` only confirms the Node
   process is listening (a static `{ status: 'ok' }`, no DB/Redis
   check); `/ready` actually verifies Postgres + Redis connectivity.
   Using the wrong endpoint created a race where later steps could run
   against a backend that looked up but wasn't actually ready,
   causing intermittent CI flakiness. Fixed to poll `/ready`.

4. **Redundant `prisma migrate deploy` in E2E CI** — the backend
   container already applies migrations on boot via
   `docker-entrypoint.sh` (`RUN_MIGRATIONS_ON_BOOT` defaults to true);
   re-running it from the CI host was harmless (Prisma migrations are
   idempotent) but wasted CI time on a redundant `npm ci` + Prisma
   engine download. Simplified to just `npm ci && prisma generate`
   (still needed for `seed:e2e`, which runs against the container's
   published Postgres port from the host).

5. **Test cookie leakage between test cases** (frontend,
   `AuthHydrationProvider.test.tsx` and `client.test.ts`):
   `document.cookie = ''` does NOT clear existing cookies in jsdom or
   real browsers — assigning an empty string isn't a valid
   "name=value" cookie description, so it's effectively a no-op. Any
   cookie set by an earlier test in the same file could silently leak
   into a later test and mask a real regression (an assertion that a
   cookie was set/cleared could pass due to a stale leftover from a
   prior test, even if the code under test were broken). Fixed to use
   `deleteCookie()` (the same helper the app itself uses) in each
   affected `beforeEach`.

6. **`nginx.conf.example`'s `/metrics` block used prefix matching**
   (`location /metrics`) rather than exact matching (`location =
   /metrics`) — harmless today (no other route starts with
   `/metrics`), but any future route accidentally named e.g.
   `/metrics-internal` would have silently inherited this block's
   restrictive IP allowlist too. Fixed to exact match.

## Second audit pass — previously-unexamined files

A follow-up pass specifically targeted files that had never been
opened in either audit above — this repo has 96 backend source files
total; only ~40 had been directly examined before this pass. Started
with the highest-risk category (security-adjacent utilities:
distributed locks, token storage, file signature checks) rather than
attempting full coverage in one pass. Found and fixed three more real
issues:

7. **`healthCache.ts`'s `inflightCheck` could get stuck rejected
   forever** — `inflightCheck = null` previously only ran on the
   success path (right before `return`), not in a `finally`. In
   today's code `performCheck()` never actually rejects (every real
   failure source is already caught internally), so this couldn't be
   triggered through normal DB-down/Redis-down paths — but any future
   code path that could throw between the check and the return would
   have left `/ready` permanently returning 503 (serving the same
   stuck rejected Promise to every caller) even after Postgres/Redis
   recovered, until the process was restarted. Fixed with `finally`;
   new regression test forces the unexpected-throw scenario directly
   to prove recovery on the next call.

8. **`tokenStore.isBlacklisted()` was fully dead code** — defined with
   real logic (a `strictMode` parameter, its own error handling) but
   never called anywhere in the codebase. The actual blacklist check
   in production always ran as hand-duplicated inline logic inside
   `auth.middleware.ts` (needed there for a specific reason:
   batching it into one Redis pipeline round-trip alongside the
   user-cache lookup, which `isBlacklisted()`'s standalone
   implementation couldn't provide) — two independent, silently-
   divergible copies of "how do you build a blacklist key" existed
   side by side. Fixed by extracting just the shared key-construction
   piece (`getBlacklistKey()`) that both the real call site and
   `blacklistAccessToken()` now use, and removing the unused function
   entirely rather than leaving it as an attractive nuisance for a
   future caller to reach for instead of the real, pipelined path.

   **This led to a second, more serious discovery while checking
   whether anything actually exercised `isBlacklisted()`'s logic**:
   `tests/setup.ts`'s Lua-script mock for `SAVE_SESSION_SCRIPT`
   (the atomic "save this session, evicting the oldest if at capacity"
   script backing `MAX_SESSIONS_PER_USER = 10`) silently ignored the
   real script's eviction branch entirely — it always just added the
   new session, as if the cap didn't exist. That meant **no test in
   this entire suite could have caught a real regression in the
   session cap** (the actual protection against unbounded per-user
   session growth) — a bug in the real Lua script itself would have
   shipped silently. Fixed the mock to mirror the real eviction logic,
   and added a new integration-style test
   (`tests/unit/tokenStore.test.ts`) that actually proves the 11th
   concurrent session evicts the oldest one rather than just trusting
   the mock's prior (incorrect) always-succeed behavior.

9. **`securityAlert.ts`'s SIEM webhook `fetch()` had no timeout** —
   the same gap PROD-FIX-02 already closed for Cloudinary uploads and
   SMTP, missed here. Arguably higher-impact than the other two: this
   path fires on every `TOKEN_REUSE`/`ACCOUNT_LOCKED` event, exactly
   the kind of thing that spikes during a real attack (credential
   stuffing, repeated failed logins) — a hung webhook endpoint under
   that load could accumulate unbounded in-flight requests right when
   the process is under the most real pressure. Fixed with the same
   `AbortController` + timeout pattern used at the other two call
   sites (10s, generous for a small JSON POST); new test confirms a
   real `AbortSignal` is passed to `fetch()`.

## Third audit pass — full business-logic modules

Continued the same "highest-risk-first" strategy into the remaining
unexamined backend modules: `favorites`, `reports`, `categories`,
`users`, and `admin` — full CRUD business logic previously never
directly reviewed. `favorites` and `reports` turned out clean (no
findings). `categories` surfaced one minor consistency gap (documented
below, not fixed — see reasoning). `users` and `admin` together
surfaced the most serious finding of this entire audit:

10. **`authService.refresh()` never checked `user.isActive`** — a
    deactivated account (via `usersService.deleteMe`, or an admin's
    `adminService.toggleUserActive`/`changeRole`) could keep minting
    fresh access tokens off a still-valid refresh token for up to its
    full 7-day lifetime. `auth.middleware.ts` DOES check `isActive` on
    every authenticated request, which limits some practical impact
    (a token minted via refresh would still be rejected on ITS next
    use once the account is inactive) — but that's a materially
    weaker protection than refusing to issue the token in the first
    place, and every deactivation path's own session cleanup
    (`tokenStore.deleteAllRefreshTokens`) is explicitly documented in
    its own code as best-effort, not something that should have been
    the *only* thing standing between "account deactivated" and
    "refresh still works." Fixed by checking `userCache.getOrFetch()`
    (the same cached-lookup helper `auth.middleware.ts` already uses
    for the identical check, chosen over a fresh `prisma.user.findUnique`
    specifically because `/auth/refresh` is now a high-traffic path
    since PROD-FIX-15 — every page load attempts one) before rotating
    tokens, failing fast with the same generic "Session expired"
    message used everywhere else in this function (no information
    disclosure about *why*). New tests cover: deactivated-account
    rejection, missing-user rejection, confirming rotation is never
    attempted for either case (fails before the atomic Redis
    operation), and confirming the normal active-account path still
    works. Also updated the pre-existing `refresh` describe block's
    `beforeEach` to give `userCache.getOrFetch` a default active-user
    mock — every prior test in that file implicitly assumed an active
    user and would otherwise have broken against the new check.

11. **Admin ad moderation never invalidated the `GET /ads` list
    cache** — `adminService.setAdFeatured`, `setAdPinned`, and
    `forceDeleteAd` all mutate `Ad` rows the list cache
    (`ads.service.ts`'s `ADS_CACHE_VERSION_KEY`) is built from, but
    none of them called the cache-busting function the regular,
    user-initiated `deleteAd`/`createAd`/`updateAd` already do
    consistently. Most serious for `forceDeleteAd`: an admin removing
    an ad for an urgent reason (fraud, a policy violation, a legal
    takedown request) could still see it served to browsing users from
    cache for up to its 30s TTL — directly undermining the "urgent"
    half of an urgent removal. Fixed by exporting
    `bumpAdsCacheVersion()` from `ads.service.ts` (previously
    module-private) rather than duplicating its
    `redis.incr(ADS_CACHE_VERSION_KEY)` logic a second time in
    `admin.service.ts` — the same single-source-of-truth reasoning as
    `getBlacklistKey` above. New tests confirm the version counter
    actually increments after each of the three admin actions, and
    that a failed update (`P2025`) does NOT bump it (nothing actually
    changed, so nothing should invalidate).

Also investigated and confirmed safe by design, not bugs:
`categoriesService.deleteCategory`'s count-then-delete TOCTOU window
is fully covered by `Category.onDelete: SetNull` at the schema level —
even a category deleted mid-race while a new ad references it cannot
orphan that ad, Postgres just nulls the reference; `favoritesService
.toggleFavorite`'s add/remove race is fully covered by the
`@@unique([userId, adId])` constraint plus explicit `P2002`/`P2025`
catch blocks; `usersService.updateMe`'s phone-uniqueness TOCTOU is
covered by `User.phone @unique` plus `error.middleware.ts`'s
repo-wide P2002→409 safety net; `adminService.changeRole`'s
last-admin-standing race is already explicitly closed with a
`Serializable` transaction (`FIX SEC-08`).

One (very minor, not fixed) consistency gap noted:
`categoriesController.getCategoryBySlug` reads `req.params.slug`
without a Zod schema, unlike every other handler in that file. Not a
real vulnerability — Express guarantees route params are always
`string` (unlike query params), and Prisma's `findUnique` is
parameterized regardless of input — just a stylistic inconsistency
against the rest of the module's otherwise-consistent validation
pattern.

One thing investigated and confirmed NOT a bug, despite looking
suspicious at first: `AuthHydrationProvider.tsx`'s `hasRunRef` guard
against React 18 Strict Mode's intentional double-effect-invocation.
`useRef` values persist across Strict Mode's simulated
mount→unmount→mount cycle (the component instance itself isn't
actually destroyed, only effects re-run) — this is React's own
documented pattern for this exact problem, not a bug.

## Second security/quality audit (2026-07-20)

This documents fixes applied following a follow-up backend security
audit (`backend-v9-prod-fixes`, dated 2026-07-20). Unlike the audit
above, these findings aren't numbered against an external priorities
list — see the audit report itself for the full findings table.
Search for `AUDIT-FIX` (severity code) in the codebase for the exact
lines changed and full reasoning inline.

| Sev | Finding | Status | Files |
|---|---|---|---|
| High | `multer@2.0.2` / `morgan@1.10.0` — disclosed 2026 CVEs (DoS, log forging) | ✅ Done | `package.json`, `package-lock.json` (manifest bumped to `multer@^2.2.0` / `morgan@^1.11.0`; **`npm install` still required to regenerate resolved lockfile entries — no network access in the environment this fix was applied from** — see PR notes) |
| Medium (M-01) | Duplicated `USER_CACHE_PREFIX` constant (`auth.middleware.ts` vs `userCache.ts`) | ✅ Done | `src/shared/utils/userCache.ts` (exported `getUserCacheKey()`), `src/middlewares/auth.middleware.ts` (imports it instead of redeclaring) |
| Medium (M-02) | TOCTOU race in per-user active-ad cap (`ads.service.ts` `createAd`) | ✅ Done — per-user Redis lock, same pattern as `FIX D-10`'s image-mutation lock | `src/shared/utils/adLock.ts` (added `withUserAdCreationLock`, factored the shared SET-NX/Lua-release primitive out of `withAdImagesLock` so both share one implementation), `src/modules/ads/ads.service.ts`, `tests/unit/adLock.test.ts`, `tests/unit/ads.service.test.ts` (new concurrency test) |
| Medium (M-03) | Non-constant-time token comparison (`/metrics` bearer token, CSRF token) | ✅ Done | `src/shared/utils/metrics.ts`, `src/middlewares/csrf.middleware.ts` (both now use `crypto.timingSafeEqual` via a shared-shape `safeTokenEquals` helper) |
| Low (L-01) | Dead/unreachable `search` spread in `ads.repository.ts`'s `findMany` | ✅ Done | `src/modules/ads/ads.repository.ts` |
| Low (L-02) | Minor TOCTOU in `favorites.service.ts` toggle | Confirmed, not fixed — self-correcting via `@@unique([userId, adId])` + `P2002`/`P2025` handling already in place; no real impact | — |
| Low (L-03) | `NODE_ENV === 'test'` branch changes core logic path in `viewsBuffer.ts` | Confirmed, not fixed this pass — needs a decision on how tests get deterministic view counts without a prod-code special case (e.g. explicit `flush()` call in test setup) | — |
| Info | `/metrics` + CSRF comparisons hardened together (M-03) | ✅ Done | (see M-03 above) |
| Info | `deleteMe` is deactivation, not erasure | Not fixed — compliance/product decision, not a code bug; confirm against GDPR/data-retention requirements before treating as an issue | — |
| Info | Polyglot-file risk on upload, mitigated by Cloudinary re-encoding | No action needed — documented for completeness in the original audit | — |

### Notes

**Dependency bump (`multer`/`morgan`):** the manifest (`package.json`)
and the lockfile's root dependency-range entries have been updated,
but the lockfile's *resolved* package entries (exact version, tarball
URL, integrity hash) could not be regenerated in the environment this
fix was written in — it has no outbound network access to reach the
npm registry. **Run `npm install` (or `npm update multer morgan`) and
commit the resulting `package-lock.json` before deploying** — the
manifest alone is not sufficient to guarantee the patched versions are
what actually gets installed.

**M-02 (ad-cap race) — why a lock instead of a serializable
transaction:** both were viable; a per-user Redis lock was chosen to
stay consistent with the codebase's own precedent (`FIX D-10`'s
`withAdImagesLock`, which solved the structurally identical
count-then-mutate race for ad images) rather than introducing a second
concurrency-control mechanism (Prisma `Serializable` isolation, which
`adminService.changeRole`'s `FIX SEC-08` already uses elsewhere) for
what's conceptually the same class of bug. The lock is deliberately
scoped to only the count-check + DB insert, not the (slow,
third-party) Cloudinary upload step, so a user's concurrent requests
aren't serialized for the full upload duration — see the inline
comment in `ads.service.ts` for the full reasoning on why an unlocked
fast-fail pre-check still runs before the uploads, with the lock's
count-check being the actually-authoritative one.

**L-02 / L-03 / `deleteMe`:** intentionally left as-is this pass,
pending the decisions noted in the table above. None of the three are
exploitable security issues — they're either already self-correcting
(L-02), a test-infra tradeoff with no production impact (L-03), or a
product/compliance question rather than a bug (`deleteMe`).

## Push notifications backend (2026-08-06)

Completes the previously half-built PWA push notification feature —
`frontend/lib/pwa.ts` and `frontend/public/sw.js` already had full
subscribe/receive plumbing (see that file's own doc comments, including
`FIX PWA-CRITICAL-04`'s defensive local-unsubscribe when the backend
endpoint was missing), but nothing on the backend received, stored, or
sent pushes. Search for `FIX PWA-PUSH-01` in the codebase for the exact
lines changed and full reasoning inline.

| Item | Status | Files |
|---|---|---|
| `PushSubscription` Prisma model (endpoint-unique, cascade-deletes with `User`) | ✅ Done | `prisma/schema.prisma`, `prisma/migrations/20260806140000_add_push_subscriptions/migration.sql` |
| `web-push`-based send service, mirrors `emailService.ts`'s graceful-degradation pattern | ✅ Done | `src/shared/utils/pushService.ts` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` env vars, optional/opt-in like `SMTP_*` | ✅ Done | `src/config/env.ts`, `.env.example` |
| `POST` / `DELETE /notifications/push-subscriptions` endpoints matching the frontend's existing calls exactly | ✅ Done | `src/modules/notifications/{notifications.routes,notifications.controller,notifications.validation,notifications.repository,notifications.service}.ts` |
| Push fan-out wired into every existing in-app notification event (new message, favorited-ad price change, saved-search match, store new product) | ✅ Done | `src/modules/notifications/notifications.service.ts` (`notificationEvents`) |
| Stale-subscription pruning on 404/410 from the push service | ✅ Done | `src/shared/utils/pushService.ts` |
| Test coverage (unit) for all of the above | ✅ Done | `tests/unit/pushService.test.ts`, `tests/unit/notifications.{repository,service,controller,validation}.test.ts` |

### Notes

**`web-push` dependency — `npm install` still required:** same
situation as the `multer`/`morgan` bump above — `web-push` and
`@types/web-push` were added to `package.json`'s manifest, but the
lockfile's resolved entries could not be regenerated in this
environment (no outbound network access to the npm registry). **Run
`npm install` and commit the resulting `package-lock.json` before
deploying.**

**Migration not applied/verified against a real database:** the
migration SQL was hand-written to match this project's existing
migration conventions exactly (see any recent `prisma/migrations/*`
folder for comparison), but there was no reachable Postgres instance
in this environment to run `prisma migrate dev`/`deploy` against or to
regenerate the Prisma client. **Run `npx prisma migrate deploy` (or
`migrate dev` locally) and confirm `npx prisma generate` picks up the
new `PushSubscription` model before deploying** — until then,
`@prisma/client`'s generated types won't actually include
`prisma.pushSubscription`, and the code in this changelog entry won't
compile against a stale generated client.

**Frontend: no changes needed.** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` was
already present in `frontend/.env.example` and `lib/pwa.ts` already
calls the exact endpoint shape implemented here — this was purely a
backend gap, confirmed by re-reading the frontend's existing comments
before starting.

**Why upsert-on-endpoint instead of a plain create:** a browser's push
subscription endpoint is stable across repeat `pushManager.subscribe()`
calls on the same permission grant, but a user can legitimately
re-trigger the subscribe flow (e.g. after clearing notification
permission and re-granting it). Treating `endpoint` as the natural key
(globally unique, not unique-per-user) and upserting on it means that
re-subscribe updates the existing row's keys instead of hitting a
unique-constraint error or silently accumulating duplicate rows that
would cause the same device to receive every push twice.

**Why VAPID keys are optional, not required:** matches every other
third-party integration in this codebase (`SMTP_*`, `CLOUDINARY_*`,
`GOOGLE_CLIENT_*`) — the app must keep starting and running normally
in dev/test/CI without real push credentials configured. Without them,
`pushService` logs what it would have sent instead of throwing, same
as `emailService`'s fallback path.

