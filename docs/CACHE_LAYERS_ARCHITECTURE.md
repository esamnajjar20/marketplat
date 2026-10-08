# MarketPlat Cache Layers — Unified Contract

## Source of truth

`shared/cache-policy.json` is the canonical policy. The build syncs it to:

- `frontend/lib/cache-policy.json` — typed browser consumers.
- `backend/src/shared/cache/cache-policy.json` — typed server consumers.
- `frontend/public/cache-policy.js` — classic Service Worker runtime.

`frontend/scripts/cache-layer-audit.mjs` fails when any generated copy drifts.

## Layers

| Layer | Owner | Purpose | Correctness rule |
|---|---|---|---|
| L0 | React Query | in-memory UI reuse | stale data is revalidated; mutations invalidate query keys |
| L1 | localStorage/IndexedDB | offline snapshots/drafts | never authoritative; owner-scoped personal data |
| L2 | Service Worker Cache Storage | weak/offline network fallback | public and personal caches are partitioned; logout clears personal buckets |
| L3 | HTTP browser/CDN | anonymous public response reuse | only anonymous public responses are shared-cacheable |
| L4 | Redis SWR | backend read-through acceleration | generation invalidation + singleflight + cross-process refresh lock |
| L5 | PostgreSQL | source of truth | all cache misses/bypasses ultimately resolve here |

## Freshness classes

- `publicLive`: feeds/lists — short HTTP TTL, short Redis soft TTL, bounded hard TTL.
- `publicDetail`: public detail objects — slightly longer backend freshness, short HTTP TTL.
- `publicHome`: expensive homepage assembly — longer Redis hard TTL because it is actively keep-warmed.
- `recommendations`: identity-aware Redis cache, never shared through HTTP.
- `reference`: categories/types/reference data.
- `personal` / `messages` / `security`: no shared HTTP cache.

## Invalidation

Mutations use `frontend/lib/cache/cacheInvalidationRegistry.ts` for local and Service Worker invalidation. The Service Worker now implements the `INVALIDATE_API_CACHE` message that the frontend already emitted; it removes matching entries from both the shared API cache and per-user API buckets.

Server-side public Redis caches use generation tokens instead of deleting keys while a refresh may still be in flight. This prevents a pre-mutation refresh from resurrecting stale data.

## Authentication boundary

Anonymous public responses may be shared through HTTP cache. Requests carrying an access token or a real session cookie receive `private, no-cache, no-transform`; they are never shared through a CDN/browser HTTP cache. The Service Worker may still keep a per-user copy for weak/offline connectivity.

CSRF-only cookies do not force a public response into the private path; only `Authorization`, `refreshToken`, or `app_has_session` indicate a session.

## Operational rules

1. Do not introduce a new TTL constant inside a feature without adding a policy class.
2. Do not write authenticated API responses into the shared Service Worker API cache.
3. Do not use `Vary: Authorization` as a substitute for `private` on personalized responses.
4. Mutation invalidation must cover React Query, local offline state, and Service Worker Cache Storage when applicable.
5. Cache misses/bypasses must remain correct when Redis is unavailable.
6. Bump the PWA cache version when cache names or fetch semantics change.
7. Run `npm run cache:audit` before release.

## CACHE-W1..W3 — Canonical Identity, Invalidation, and HTTP Ownership

The cache system now has a single logical contract in `shared/cache/cache-contract.json`.

- **Identity:** `shared/cache/cacheKey.ts` defines the canonical key algorithm used by frontend and backend.
- **Domains:** every cache domain declares namespace, scope (`public`, `personal`, `private`) and policy.
- **Invalidation:** mutation path prefixes, affected cache domains, and offline slots are defined once in the contract and consumed by frontend/backend registries and the Service Worker.
- **HTTP ownership:** route middleware owns `Cache-Control`; controllers must not define cache TTLs or directives.
- **Service Worker:** invalidation accepts canonical domains and resolves them back to physical URL prefixes while retaining exact prefix deletion for compatibility.
- **Audit:** `npm run cache:audit` validates policy copies, contract copies, key-algorithm parity, invalidation parity, HTTP ownership, and SW integration.

## CACHE-W4..W6 — Mutation Invalidation, Redis Identity, Observability

- **W4:** successful Axios mutations resolve the canonical invalidation contract and invalidate only active React Query prefixes. Inactive queries are marked stale without an immediate fetch. Offline/SW replay continues to invalidate after server acceptance.
- **W5:** public-list generation tokens and reference-data Redis keys now use the same `ck:v1:<scope>:<namespace>:...` identity algorithm. Legacy keys are intentionally not dual-read; they naturally expire and the next request rebuilds the canonical entry.
- **W6:** SWR cache hit/stale/miss/bypass/refresh/lock events are exported through `app_cache_events_total` in the same Prometheus registry as application metrics. Labels are bounded to logical cache names and event types only.


## CACHE-W7..W9 — Storage Pressure, Contract Audit, and Correctness

- **W7:** browser quota pressure is a shared budget across Cache Storage/IndexedDB. Warning pressure reduces background warming to public data; critical pressure pauses warming after best-effort cleanup of reconstructable caches. The Service Worker progressively trims API/image caches at 90%/95% quota and never targets durable offline-write/user-owned caches.
- **W8:** `frontend/scripts/cache-contract-audit.mjs` validates domain scopes, query prefixes, invalidation references, and generated contract parity.
- **W9:** regression coverage verifies API-version mutation routing, unmapped-path no-op behavior, quota boundaries, and per-user ownership of offline JSON/list caches.

## CACHE-W10..W12 — Server Invalidation Boundary, Observability Hardening, Final Audit

- **W10:** `backend/src/shared/cache/serverCacheInvalidation.ts` is the canonical server-side entry point for public-list generation invalidation. It resolves mutation paths from the shared contract and refuses to globally invalidate personal/private domains. The store-types mutation path now uses this boundary instead of hard-coding a Redis generation namespace.
- **W11:** SWR telemetry is emitted at the actual `swrGetWithStatus()` decision points (`hit`, `stale`, `miss`, `bypass`) and during background refresh/lock contention. Metrics remain in the application Prometheus registry and use bounded logical cache/event labels rather than request/user identifiers.
- **W12:** `frontend/scripts/cache-final-audit.mjs` performs the release gate across contract parity, key-algorithm parity, W4-W9 artifacts, server invalidation boundary, public-list canonical identity, HTTP ownership, Service Worker contract usage, and cache telemetry. `cache:contract-audit` and `cache:final-audit` are exposed as explicit package scripts.

## CACHE-W10..W12 — Performance, Lifecycle, Final Hardening

- **W10 — cache performance telemetry:** the Redis SWR boundary records monotonic operation duration into `app_cache_operation_duration_seconds`, using bounded `cache`/`event` labels and fixed latency buckets. This is measurement infrastructure; production before/after latency must be read from the deployed Prometheus data rather than inferred statically.
- **W11 — coordinated browser lifecycle:** critical storage-pressure cleanup delegates to the Service Worker through `TRIM_DISPOSABLE_CACHES`. The SW trims disposable API/image layers according to pressure instead of deleting their entire caches. Protected layers such as core, saved ads, personal shells and the offline queue are excluded.
- **W12 — final architecture gate:** `cache-final-audit.mjs` verifies the canonical 23-domain contract, key parity, lifecycle coordinator, storage-pressure delegation and W10 telemetry. The frontend exposes `cache:contract-audit`, `cache:performance-audit` and `cache:final-audit` scripts for repeatable CI/local checks.
