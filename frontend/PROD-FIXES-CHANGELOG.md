# Production Readiness Fixes — Frontend (marketplace-v10)

Companion to `backend-v9/PROD-FIXES-CHANGELOG.md` — this file only
covers changes made directly in this repo. See the backend changelog
for the full 20-item list and the reasoning behind items not fully
closed.

| # | Priority (from audit) | Status | Files |
|---|---|---|---|
| 1 | CI: run test/lint/type-check/build on every push/PR | ✅ Done | `.github/workflows/ci.yml` (new) |
| 7 | Actually run Playwright E2E | ✅ Infra done — set `BACKEND_REPO` in the `e2e` job before first real run | `.github/workflows/ci.yml` (`e2e` job) |
| 14 | Expand E2E coverage | ✅ `favorites.spec.ts` added | `e2e/tests/favorites.spec.ts` (new), `e2e/helpers/ads.ts` (new — `createAdViaUI` extracted from `ad-lifecycle.spec.ts` so both specs can share it), `e2e/README.md` |
| 15 | `refreshToken` in `localStorage` vs httpOnly cookie | ✅ Done (paired with the backend's cookie/CSRF change) | `store/auth.store.ts`, `types/auth.types.ts`, `api/client.ts`, `api/auth.api.ts`, `lib/csrf.ts` (new), `providers/AuthHydrationProvider.tsx`, 8 test files updated (see "What changed" below) |
| 17 | Standalone smoke test wired into the deploy path | ✅ Done (runs against the E2E backend stack before Playwright) | `.github/workflows/ci.yml` |

## #15 — what changed and why

`refreshToken` is no longer stored anywhere in this app's JS-reachable
state (Zustand, localStorage) — the backend now sets it as an httpOnly
cookie directly (see `backend-v9/src/shared/utils/authCookies.ts`).
The practical consequences for anyone working in this codebase:

- **`AuthTokens` no longer has a `refreshToken` field.** If you see a
  type error referencing this, the fix is almost always "just use
  `accessToken`" — nothing in this codebase should need the refresh
  token's actual value anymore.
- **`authApi.refresh()` takes no arguments** (previously
  `refresh(refreshToken, config?)`). The httpOnly cookie rides along
  automatically via `apiClient`'s `withCredentials: true`.
- **`AuthHydrationProvider` always calls `/auth/refresh` on mount now**,
  not just when a persisted token existed — it has no way to check
  client-side whether a session exists anymore (the cookie is
  invisible to JS by design), so it asks the backend instead. This
  means one extra network round-trip on every page load for a
  logged-out visitor that didn't happen before; this is the accepted
  cost of closing the XSS exposure a JS-readable 7-day token
  represented.
- **State-changing requests now carry an `X-CSRF-Token` header**
  automatically (see `lib/csrf.ts` + `api/client.ts`'s request
  interceptor) — required by the backend's new CSRF middleware
  whenever a `csrfToken` cookie is present. This is transparent to
  every existing mutation hook (`useAuthMutations`, `useFavoriteMutations`,
  etc.) — none of them needed changes, since the header is attached at
  the `apiClient` level, not per-call.
- **Do NOT confuse this with `app_access_token`** (`lib/cookies.ts`) —
  that's an unrelated, separate cookie used only by `middleware.ts` for
  Next.js Edge route protection, holding a copy of the short-lived
  access token. It was not part of this fix and works exactly as
  before.

## What to do before the `e2e` job actually runs successfully

`.github/workflows/ci.yml`'s `e2e` job checks out `backend-v9` as a
sibling repo via `BACKEND_REPO: your-org/backend-v9` — **this is a
placeholder and must be changed** to the real repo slug (and
`BACKEND_CHECKOUT_TOKEN` added as a repo secret if backend-v9 is
private and not in the same GitHub org). Until that's set, the `e2e`
job will fail at the "Check out backend" step — this is expected and
intentional (failing loudly beats silently skipping E2E).

If `backend-v9` is actually meant to live as a subdirectory of this
same repo rather than a separate one, replace the two-checkout setup
in the `e2e` job with a single checkout and adjust the
`working-directory` paths accordingly.

## Post-implementation audit — real bugs found and fixed

A dedicated audit pass after the fixes above found and fixed two real
issues in this repo (see `backend-v9/PROD-FIXES-CHANGELOG.md` for the
backend-side findings from the same pass):

1. **`e2e` job polled `/health` instead of `/ready`** before running
   `seed:e2e` and Playwright — `/health` only confirms the backend
   process is listening, not that it's actually connected to Postgres/
   Redis (`/ready` is the correct readiness signal). Using the wrong
   one created a race that could make E2E runs intermittently flaky.
   Fixed to poll `/ready`.

2. **Redundant `prisma migrate deploy` step** — the backend container
   already applies migrations on boot; re-running it from the CI host
   was harmless but wasted CI time. Simplified to just install
   dependencies + generate the Prisma client (still needed on the host
   for `seed:e2e`).

3. **Test cookie leakage between test cases** — `document.cookie = ''`
   (used in `AuthHydrationProvider.test.tsx` and `client.test.ts`'s
   `beforeEach` blocks) does NOT clear existing cookies in jsdom or
   real browsers; it's a no-op, since an empty string isn't a valid
   cookie description. A cookie set by one test could silently leak
   into a later test and mask a real regression. Fixed to use
   `deleteCookie()` from `lib/cookies.ts` (the same helper the app
   itself uses).

