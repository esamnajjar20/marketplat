# Backend architecture (apps/api)

## Layout

```
src/
  app.ts, server.ts, instrument.ts      entry points (unchanged)
  routes/                               /api/v1 route table
    index.ts                              global middleware + registration order
    <domain>.routes.ts                    mounts that domain's routers
  modules/<domain>/<module>/            feature code
    <module>.routes.ts / .controller.ts / .service.ts / .repository.ts / .validation.ts / index.ts
  bootstrap/                            HTTP wiring: CORS, docs, health, logging, cache warm-up
  middlewares/                          reusable Express middleware
  config/                               env, prisma, redis, cloudinary, limits
  shared/                               framework-agnostic building blocks (cache, auth, errors, queue, ...)
  scripts/                              cron / one-off jobs (paths are referenced by CI and the Go worker)
```

## Domains

| Domain        | Modules |
|---------------|---------|
| `identity`    | auth, users, sellers |
| `engagement`  | favorites, follows, stories, notifications, conversations, badges, activity, saved-searches |
| `classifieds` | ads, categories, requests |
| `commerce`    | stores, store-types, products, product-categories, marketplace-orders, sales, customers, collections, promotions |
| `services`    | service-providers, service-categories, service-types, service-listings, service-requests, service-reviews, appointments |
| `discovery`   | search, home, recommendations |
| `trust`       | reports, fraud, blocked-users, audit-logs |
| `platform`    | admin, analytics, observability, media, user-simulator, internal-go-worker |

New module? Put it under the domain it belongs to and mount its router in
`src/routes/<domain>.routes.ts`. New domain? Add `src/routes/<domain>.routes.ts`
and register it in `src/routes/index.ts`.

## Rules (enforced by `tests/unit/architecture.test.ts`, layering also by ESLint)

1. `shared/`, `config/` and `middlewares/` never import from `modules/`.
   One legacy exception is allow-listed in the test and in `.eslintrc.json`
   (`shared/cache/publicListCache.ts -> home.cache.keys`); the list must only shrink.
2. `src/modules/` holds only domain folders, and every domain has a route registry.
3. Module names are unique across domains, and every module folder has an `index.ts`.
4. File names inside `modules/` are kebab-case (`sales-report-csv.ts`); `shared/` keeps camelCase.
5. Domain-to-domain imports are a ratchet: the 35 edges that exist today are listed in the test.
   A new edge fails the test until someone adds it on purpose. Many existing edges are mutual
   (e.g. engagement <-> identity), so domains are an organizing aid, not a layering guarantee.

## Route ordering

Express matches overlapping prefixes in registration order. The only overlaps:

- `/admin` (platform) must be registered before `/admin/audit-logs` and `/admin/fraud` (trust).
- `/sales` before `/sales/installments`; the two `/store-types` routers keep their order.

`routes/index.ts` registers `platform` before `trust` for this reason.

## Moves made in the reorganization

- `modules/<module>` -> `modules/<domain>/<module>` (43 modules).
- `routes.ts` -> `routes/index.ts` + one registry per domain (same 46 mounts, same relative order where it matters).
- `shared/cache/cacheWarmup.ts` -> `bootstrap/cacheWarmup.ts` (it orchestrates module services, so it is app wiring, not shared code).
- `shared/buffers/activityBuffer.ts` -> `modules/engagement/activity/activity.buffer.ts` (it is the activity module's write buffer).
- `GoogleProfileData` type -> `shared/auth/googleProfile.types.ts` (re-exported from `google.strategy.ts`).

## Round 2 changes

- `sales/salesInsights.service|salesReportCsv|salesAutomation.service` renamed to kebab-case.
- `conversations/cloudinaryMediaUrl.ts` -> `shared/media/cloudinaryMediaUrl.ts` (generic URL parser).
- `src/types/serverless-http.d.ts` -> `src/shared/types/` (one place for ambient types).
- `platform/user-simulator/index.ts` added; `platform.routes.ts` imports the barrel.

## Why some things were deliberately left alone

- **Splitting big files** (`outbox.worker.ts`, `rateLimit.middleware.ts`): many tests assert on the
  *source text* of these files via `__dirname` + `fs.readFileSync`, so splitting changes what those
  tests see. Do it together with updating those tests, not as a blind move.
- **Mirroring `tests/` by domain**: ~18 tests build paths with `__dirname`, and CI path filters name
  specific test files (e.g. `cache-integrity.yml`).
- **Grouping `src/scripts/`**: `package.json`, cron docs and the Go worker docs reference those paths.

## Known follow-ups (intentionally not done)

- Cross-module imports still reach into other modules' files (`../ads/ads.service`) instead of their `index.ts`.
  Switching to barrels risks import cycles; do it module by module with the test suite running.
- Very large files (`shared/outbox/outbox.worker.ts` ~1.7k lines, `admin.service.ts`, `auth.service.ts`, ...)
  should be split by responsibility; that is a behavioral refactor, not a move.
- `src/scripts/` stays flat because CI workflows, `package.json` and the Go worker reference its paths.
