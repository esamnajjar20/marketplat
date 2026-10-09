# Offline, cache and warming audit — final pass

## Changes in this patch

- Re-check `navigator.onLine` immediately before starting the warming engine; the previous code re-checked a stale boolean snapshot captured before waiting for queue replay/storage pressure.
- Validate persisted IndexedDB query records more defensively, including key/data shape and numeric metadata.
- Reject future-dated persisted query entries beyond a small 60-second clock-skew allowance, as well as entries over the per-entry size limit during restore.
- Guard access to the last-cache timestamp in localStorage so privacy-restricted storage cannot throw into callers; ignore corrupt/future markers.
- Prevent a user-data warming request started under one account from writing its response if the active offline user scope changed while the request was in flight. This covers account switching where `isAuthenticated` can remain true.
- Add a regression test for future-dated query cache entries.
- Correct the warming static audit to check the current engine-result return contract (`result?.ran`) rather than a removed variable (`pipelineRan`).
- Includes the prior hydration fixes carried forward in the previous patch bundle.

## Static verification executed

Passed:
- `scripts/warming-final-audit.mjs`
- `scripts/cache-contract-audit.mjs`
- `scripts/cache-performance-audit.mjs`
- `scripts/cache-final-audit.mjs`
- `scripts/cache-layer-audit.mjs`
- `scripts/query-invalidation-audit.mjs`
- `scripts/query-invalidation-semantic-audit.mjs`

Not run: TypeScript compilation, Vitest, Next production build, and browser/service-worker offline E2E. `node_modules` was not present in the supplied project directory, so these checks cannot honestly be marked as passed.

## Manual acceptance checks recommended

1. Load public listings online, reload offline, and verify cached React Query data restores before network retry settles.
2. Switch account while user-data warming requests are in flight; confirm old-user responses are not written after the account scope changes.
3. Simulate quota exhaustion / IndexedDB unavailable / localStorage blocked; verify the app remains usable and queued writes are not blocked.
4. Turn offline on while the pipeline waits for queue replay; verify warming stops rather than starting new network work.
5. Install/update the PWA and confirm warmed route shells are found by the active service worker at cache version v49.
