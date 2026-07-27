# سوق غزة — Marketplace Frontend

The Next.js frontend for **سوق غزة** (Gaza Marketplace), a full-stack,
Arabic-first (RTL) classifieds platform. Pairs with the `backend-v9`
Express/Prisma API — see that repo's own README for the backend side.

## Tech Stack

- **Framework**: Next.js 15 (App Router) + React 19
- **Language**: TypeScript (`strict: true`, `noUncheckedIndexedAccess`)
- **State**: Zustand (auth/UI state) + TanStack Query (server state)
- **Styling**: Tailwind CSS + shadcn/ui components
- **HTTP**: Axios, with a queued-refresh interceptor (see `api/client.ts`)
- **Unit/component tests**: Vitest + React Testing Library
- **E2E tests**: Playwright (see `e2e/README.md`)

## Prerequisites

- Node.js 20+
- The backend API running somewhere reachable (see `backend-v9`'s
  README/Docker setup) — this app has no functionality of its own
  without it.

## Setup

```bash
npm install
cp .env.example .env.local
# edit .env.local — at minimum, point NEXT_PUBLIC_API_URL / API_BASE_URL
# at your running backend (defaults assume it's on localhost:5000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

See `.env.example` for every recognized environment variable and what
each one does — Cloudinary image config, optional error-reporting
webhook, optional analytics/feature flags.

## Route structure

The App Router uses route groups to apply different layouts/access
rules without affecting the URL:

| Group | Layout | Contains |
|---|---|---|
| `app/(public)/` | `PublicHeader` | Home, ad detail, categories, search, public profiles — no auth required |
| `app/(auth)/` | Centered auth card | Login, register, forgot/reset password |
| `app/(protected)/` | `ProtectedHeader` | Dashboard, my-ads, favorites, messages, settings — requires a logged-in user (enforced by `middleware.ts`) |
| `app/(admin)/admin/` | `AdminSidebar` + `AdminHeader` | Ads/users/reports/categories management — requires `role: ADMIN` |

`middleware.ts` is the first line of defense for `(protected)`/`(admin)`
route access, but — deliberately, and documented in that file's own
comment — it is **not** the real security boundary for admin data. The
role cookie it reads can be forged client-side; every actual admin API
call is independently checked and rejected server-side
(`admin.middleware.ts` in the backend) regardless of what the frontend
allowed the page to render. `e2e/tests/admin.spec.ts` has tests
specifically covering this distinction.

## Scripts

```bash
npm run dev              # local dev server
npm run build             # production build (also used by Docker)
npm run start             # run a production build locally
npm run lint               # ESLint
npm run type-check         # tsc --noEmit against the app itself (excludes __tests__/, e2e/)
npm run type-check:e2e     # tsc --noEmit against e2e/ specifically, its own tsconfig

npm test                   # Vitest, single run
npm run test:watch         # Vitest, watch mode
npm run test:coverage      # Vitest with coverage (see thresholds in vitest.config.ts)
npm run test:ui            # Vitest's browser UI

npm run e2e                # Playwright, headless — see e2e/README.md for setup first
npm run e2e:ui              # Playwright's interactive UI mode
npm run e2e:report          # open the last Playwright HTML report
npm run e2e:codegen         # record a new E2E test by clicking through the app
```

`type-check` and `test` intentionally target different, non-overlapping
directory sets (`type-check` excludes `__tests__/`/`e2e/`; `test` only
runs `__tests__/`) — this is deliberate, not an oversight: Playwright
specs use Playwright's own `test`/`expect` and Vitest specs use
Vitest's globals, and neither the app's own production build nor the
other framework's runner should be type-checking or executing the
other's files. See `e2e/tsconfig.json` for the E2E-specific TypeScript
config.

## Testing strategy

Three layers, each covering something the others don't:

1. **Vitest + RTL** (`__tests__/`) — component-level, with hooks/API
   calls mocked at the module boundary. Fast, runs on every save. This
   is where most business logic (validation, derived state, conditional
   rendering) gets its coverage.
2. **Playwright E2E** (`e2e/`) — a handful of critical user journeys
   (auth, the full ad lifecycle, admin flows) through a real browser
   against the real backend and a real database. Slower, and requires
   the setup described in `e2e/README.md`, but it's the only layer that
   catches a bug in the actual frontend↔backend contract — see that
   README's own note on why this mattered concretely for this project.
3. **Backend integration tests** (in `backend-v9/tests/integration/`)
   — not part of this repo, but worth knowing about: they hit the
   backend's real HTTP routes against a real test database, one layer
   short of a full E2E test (no browser, no frontend involved).

## Docker

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_APP_URL=https://example.com \
  -t marketplace-frontend .
docker run -p 3000:3000 marketplace-frontend
```

Multi-stage build (`Dockerfile`) producing a minimal `output: standalone`
image, non-root user, healthcheck against `/`. Public `NEXT_PUBLIC_*`
values are baked in at **build** time (Next.js inlines them into the
client bundle) via `--build-arg`, not read from the container's runtime
environment — rebuild the image if one of those needs to change, a
runtime env var override won't do it.

## Known Technical Debt (Deliberately Deferred)

Tracked here rather than silently left for someone to rediscover later:

- **E2E coverage is real but partial.** `e2e/README.md` has a full
  breakdown of what's covered (auth, the ad lifecycle, core admin
  flows) and what isn't yet (favorites, messages, notifications,
  settings pages, the public search/category browsing UI on its own,
  mobile-specific behavior). None of the E2E suite has actually been
  run in the environment it was authored in — no network access to
  install Playwright's browser binaries or reach a running backend.
  Treat it as reviewed-by-reading until someone runs
  `npx playwright install --with-deps chromium && npm run e2e` for
  real.
- **No root-level architecture/contributing doc beyond this README.**
  Component-level conventions (when to reach for a shared `components/ui`
  primitive vs. a bespoke one, the memoization/mocking patterns used
  in `__tests__/`) are consistent in practice but only discoverable by
  reading existing code, not written down anywhere.
