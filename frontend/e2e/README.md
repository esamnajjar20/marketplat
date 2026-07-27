# E2E Tests (Playwright)

Full-stack, real-browser tests: the actual Next.js app talking to the
actual backend (`backend-v9`), which talks to a real Postgres + Redis.
Nothing here is mocked. This is the layer of testing this project's own
audit history flagged as the biggest coverage gap — the only kind of
test that would have caught a bug like `isNegotiable` silently
reverting once it round-trips through validation, the database, and
back through the real API response shape.

If you only need component-level confidence, `npm test` (Vitest) is
faster and already covers ~90% of components in isolation. Reach for
these E2E tests when you need to know the **real** frontend-backend
contract still holds — after touching auth, the ad lifecycle, uploads,
or anything admin-only.

## Prerequisites

1. **Docker** (for Postgres + Redis + backend), or a locally-running
   Postgres/Redis + `npm run dev` in `backend-v9` if you prefer not to
   use Docker.
2. **Node 20+** in both `marketplace-v10` and `backend-v9`.
3. Playwright's browser binaries — a **separate download step**, not
   part of `npm install`:
   ```bash
   cd marketplace-v10
   npm install
   npx playwright install --with-deps chromium
   ```
   (This sandboxed environment these files were written in has no
   network access to run that install step or to actually execute the
   suite — treat everything below as reviewed-by-reading, not
   verified-by-running. Run the full suite locally once before trusting
   it in CI.)

## 1. Bring up an isolated E2E backend stack

**Do not point these tests at your regular dev database.** Tests create
real users, ads, and categories, and the delete/edit specs remove data.
Use a separate database name so nothing here can touch dev data by
accident.

From `backend-v9/`:

```bash
POSTGRES_DB=classifieds_e2e \
DB_CONNECTION_LIMIT=20 \
docker compose -f docker-compose.full.yml up -d --build
```

This starts Postgres, Redis, and the backend API together (see
`docker-compose.full.yml`). Wait for the backend's healthcheck to pass:

```bash
docker compose -f docker-compose.full.yml ps
# backend service should show "healthy"
```

Then run migrations against that same database:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/classifieds_e2e \
npm run prisma:migrate:deploy
```

## 2. Seed E2E-only data

The E2E admin flows need an `ADMIN`-role user, and there is
deliberately **no self-serve way to become an admin through the UI**
(see `admin.middleware.ts` / `AdminUsersTable`'s role-change flow,
which only another admin can trigger) — so that account has to be
created at the database level instead.

From `backend-v9/`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/classifieds_e2e \
npm run seed:e2e
```

This is idempotent (safe to re-run before every suite run) and
refuses to run against any database whose name doesn't contain `test`
or `e2e` — see the safety check at the top of
`src/scripts/seedE2E.ts`. If you rename the E2E database, that check
(and this doc) need to agree, or the script will simply refuse to run.

It creates:
- An admin user (`e2e-admin@example.test` / see `E2E_ADMIN_PASSWORD` in
  `seedE2E.ts` — mirrored in `marketplace-v10/e2e/fixtures/seed-data.ts`,
  **the two must be kept in sync manually** if either changes).
- A small fixed category tree (`مركبات` > `سيارات`, `عقارات`) — enough
  for `AdForm`'s category `<select>` and `CategoryGrid`'s icon-matching
  rules without seeding all real production categories.

## 3. Point the frontend at the E2E backend

In `marketplace-v10/`, create `.env.e2e` (not committed) alongside the
existing `.env.example`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:5000
API_BASE_URL=http://localhost:5000
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

(Port 5000 matches `docker-compose.full.yml`'s default backend port —
adjust if you've overridden it.)

## 4. Run the suite

```bash
cd marketplace-v10
npm run e2e            # headless, all specs
npm run e2e:ui         # Playwright's interactive UI mode — useful for debugging
npm run e2e:report     # opens the last HTML report
```

`playwright.config.ts` will build and start the Next.js app itself
(`npm run build && npm run start`) against `E2E_BASE_URL`
(`http://localhost:3000` by default) unless `E2E_SKIP_WEBSERVER=1` is
set — set that if you're running `npm run dev` yourself and want
Playwright to reuse it instead of starting its own server.

### Running a single file while debugging

```bash
npx playwright test e2e/tests/ad-lifecycle.spec.ts --headed
```

## What's covered so far

| File | Covers |
|---|---|
| `auth.spec.ts` | Register, login, logout, wrong-credentials, duplicate-email, session-survives-reload, the `?from=` redirect-after-login regression (FIX AUTH-06) |
| `ad-lifecycle.spec.ts` | Create (incl. required image, magic-byte-spoofed-file rejection), view, edit (incl. existing-image prefill/removal), mark as sold, delete, my-ads status filtering |
| `admin.spec.ts` | Dashboard stats, category create/edit/delete (real network round trip behind the mocked-hook unit tests), ads table, and — importantly — that a regular user is actually denied admin data, not just shown a client-side gate |
| `favorites.spec.ts` | PROD-FIX-14: favorite/un-favorite from the ad detail page, appearance/removal in `/favorites`, the empty state, state surviving a reload (confirms it's server-backed, not local-only), and the logged-out "please log in" path |

## What's still NOT covered (be aware before assuming full confidence)

- **Messages, notifications, sessions/security settings
  pages** — no spec file yet for any of these. (Favorites was the
  first of this group to get coverage — see favorites.spec.ts.)
- **Search & category browsing** (`/search`, `/categories/[slug]`) —
  the public browsing side has no dedicated spec; only exercised
  incidentally via `ad-lifecycle.spec.ts` visiting a detail page.
- **Reports flow end-to-end** (a user reporting an ad, then an admin
  resolving/dismissing it) — `admin.spec.ts` doesn't create a report
  itself, so `AdminReportsTable`'s real network behavior (as opposed to
  its mocked-hook unit test) isn't exercised yet.
- **Mobile-specific behavior** — `playwright.config.ts` has a
  `mobile-chromium` project wired up (`*.mobile.spec.ts` naming
  convention), but no spec files use it yet.
- **Rate limiting, account lockout** — deliberately not exercised here;
  hammering the real rate limiter in a shared E2E environment would
  make the suite itself flaky and would affect other tests running
  concurrently against the same backend.

## Design notes / gotchas for whoever extends this

- **Every test gets its own freshly-registered user** via the
  `authedPage` fixture (`e2e/fixtures/authenticated.ts`) — never a
  shared login — so ad/profile assertions stay unambiguous when tests
  run in parallel against the same real database. The admin fixture is
  the one exception (`e2e/fixtures/admin-authenticated.ts`): there's no
  way to mint a fresh admin per test, so admin specs reuse the single
  seeded admin and must avoid asserting on exact global counts (e.g.
  "there are exactly 3 reports") since that account's data persists
  across the whole suite's history.
- **Unique test data** (`e2e/helpers/test-data.ts`) uses
  `crypto.randomUUID()`, not `Date.now()` alone — two workers starting
  in the same millisecond is a real collision risk under
  `fullyParallel: true` against a shared Postgres instance.
- **Hover-revealed buttons**: `ImageUpload`'s remove buttons are
  `hidden group-hover:flex` (only visible on hover) — assert
  `toBeAttached()`, not `toBeVisible()`, when checking they rendered
  without actually hovering first.
- **Locale-dependent number formatting**: several components use
  `toLocaleString('ar')` / `Intl.NumberFormat('ar-PS')`, which may
  render Eastern Arabic-Indic digits or plain Western digits depending
  on the runtime's ICU build — don't hardcode either digit form in a
  new assertion; compute the expected string with the same locale call
  instead (see the equivalent note in `DashboardStats.test.tsx`).
