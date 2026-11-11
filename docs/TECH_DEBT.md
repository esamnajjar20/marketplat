# Tech Debt — Failing Tests

Generated: 2026-10-25

## Frontend (42 files, 77 tests failing / 4252)
### Component tests (35 files) — likely single-cause
Most failures in `__tests__/components/*.test.tsx` share expected-vs-actual
mismatches for seller/context rendering. Root cause likely: a product
decision (show seller everywhere) not reflected in component tests.
Action: audit one representative test, batch-update if uniform.

### Isolated unit failures (7 files)
- `cachePolicy.test.ts` — constants reduced (120 vs 200 expected)
- `filterUrl.test.ts` — geo query serialization changed
- `buildVersionCheck.test.ts` — reload called twice
- `capacitor-deepLinks.test.ts` — push arg mismatch
- `offlineCoreBundle.test.ts` — Blob (was fixed today via arrayBuffer in sw.js; retest)
- `offlineRouteShells.test.ts` — mock cache behavior

## Backend (8 files, 11 tests / 3504)
### Real bugs (Low priority)
- `rateLimit.middleware` — IPv6 not normalized to /64
- `viewsBuffer` — `increment` returns false on new viewer

### Test isolation (4 tests, cascading)
- `home.cache` — fake timers leak

### Stale tests (4 files)
- code evolved; assertions not updated

## Not fixed because
1. All failures pre-date the audit
2. Production works (manual + k6 verified)
3. Risk of touching working code > benefit of green tests
