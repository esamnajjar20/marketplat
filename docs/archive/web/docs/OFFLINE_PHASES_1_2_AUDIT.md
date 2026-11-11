# Offline UX — Phase 1 & 2 Audit and Fixes

## Scope and method

Static source audit of the current Marketplat frontend and its offline/cache integration. The audit traced the root React Query provider, IndexedDB persistence, the canonical cache contract, query-key factories, public route-shell warming, and existing offline UX notes. This is a code audit, not a claim of successful browser/offline E2E testing.

## Phase 1 — Findings

### Existing implementation confirmed

- `providers/AppProviders.tsx` connects `restoreOfflineQueryCache`, `subscribeOfflineQueryCache`, and an initial persistence pass to the root QueryClient.
- The Service Worker warming system has a public core route list (including `/`, `/offline`, `/ads`, `/products`, `/search`, `/stores`, `/services`, and `/service-providers`) and a separate protected/personal shell list.
- Offline query snapshots use IndexedDB and are intended for public read data only. User profile, notifications, conversations/messages, recommendations and unknown query roots are outside the intended persistence boundary.
- The route shell and query-data cache are separate layers: having an HTML/RSC shell cached does not prove the API data for that route is present offline.

### Confirmed risks

1. **Overly broad persistence prefixes:** the cache contract uses broad prefixes such as `['products']`, `['ads']`, `['stores']`, and `['service-listings']`. Treating those prefixes as a complete persistence allowlist also matches sibling keys such as `['products', 'me', ...]`, `['ads', 'me', ...]`, and `['stores', 'me']`. That conflicts with the documented public-only policy and could persist user-specific data.
2. **Small per-query limit:** the 20 KiB cap rejected an entire successful query snapshot if it exceeded that size. Normal list payloads can exceed 20 KiB, leaving a page shell available but its data unavailable offline.
3. **Untrusted stored size metadata:** restore checked the persisted `bytes` field, but did not independently recompute the serialized payload size. Corrupt IndexedDB records could claim a small size while holding a larger payload.
4. **Verification gap:** source/static checks do not prove that a page renders from IndexedDB after a hard reload with the browser genuinely offline. Full browser E2E remains necessary.

## Phase 2 — Changes made

- Added a shape-aware allowlist after the canonical contract-prefix check. Only known public query-key branches are persisted; private owner branches, admin branches, stock/analytics branches, ad search terms, location-specific provider queries, and unknown homepage branches fail closed.
- Increased the maximum persisted query snapshot from 20 KiB to 64 KiB. The existing 5 MiB aggregate budget, 500-record cap, and seven-day age limit remain in place.
- Recompute serialized data size during restore and reject records whose payload cannot be serialized, exceeds 64 KiB, or disagrees with its stored byte count.
- Added regression tests for allowed public shapes, private/admin siblings, 30 KiB list payloads, oversize payloads, future timestamps, and stable query-key identity.
- Added `scripts/offline-phase12-audit.mjs`, a dependency-free static guardrail for the provider integration, key-shape allowlist, restored-size validation, cache limit, and regression tests.

## Verification performed

- `node scripts/offline-phase12-audit.mjs`: PASS (6 checks).
- Existing warming, cache contract, cache performance, cache final/layer, and query invalidation static audits: PASS.
- ZIP integrity and browser E2E were not run as part of this source audit.
- `node_modules` was absent, so Vitest, TypeScript project type-check, and Next.js production build were not run. The new Vitest regression cases are included but not represented as executed tests.

## Remaining work before production sign-off

1. Install project dependencies in CI and run the offline-query-cache Vitest suite, full type-check, lint, and production build.
2. Browser E2E: warm `/`, `/products`, `/ads`, `/stores`, `/services`, `/service-providers`; hard reload with network disabled; verify real data renders and no infinite skeleton remains.
3. Test first-ever offline launch (no prior cache), stale/expired data, storage failure/quota, logout/account switching, and reconnect/refetch.
4. Inspect query response sizes from real representative payloads before deciding whether 64 KiB is the right per-entry cap.
