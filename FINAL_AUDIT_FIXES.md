# MarketPlat Final Cache/Warming Audit Fixes

Applied on top of Cache W1-W12.

## Fixed
- Removed unused `SW_CACHE_VERSION` import from `frontend/lib/offlineStoragePressure.ts`.
- Added `cacheWarmupTasksTotal` and `cacheWarmupTaskDurationSeconds` to the shared Prometheus registry.
- Wired cache-warmup task outcome/duration telemetry in `backend/src/shared/utils/cacheWarmup.ts` using monotonic timing.
- Fixed `cache-performance-audit.mjs` and `cache-final-audit.mjs` so npm execution from `frontend/` resolves repository-root paths correctly.
- Extended the final audit to catch dead storage-pressure imports and missing/unwired warmup telemetry.

## Validation
- `npm run cache:contract-audit` PASS
- `npm run cache:performance-audit` PASS
- `npm run cache:final-audit` PASS
- Final audit: `CACHE W1-W12 AUDIT PASSED`
- Full TypeScript compilation in this sandbox remains blocked by missing project dependencies (`node_modules`), not by the repaired cache/warming errors.
