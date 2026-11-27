# MarketPlat — Unified Cache Policy v2

## Single source of truth

Edit only these canonical files:

- `shared/cache-policy.json`: freshness, retention, storage budgets, HTTP/React Query/SQLite/edge/gateway TTLs.
- `shared/cache/cache-contract.json` (v3): cache domains, scopes, query prefixes, invalidation rules, mobile mutation rules, and public read/write cache tags.
- `shared/cache/cacheKey.ts`: canonical Redis/API cache identity algorithm.
- Runtime-specific TTLs and budgets (including recommendation/search Redis TTLs, auth snapshot L1/Redis limits, query-family freshness, mobile SQLite/image budgets, and edge cache limits) are also stored in `shared/cache-policy.json`.

Run `pnpm cache:sync` after changing either JSON contract or the cache-key algorithm. The script generates the frontend/API JSON mirrors, Service Worker JavaScript globals, Mobile and Cloudflare Worker TypeScript policy modules, and frontend/API cache-key mirrors. Generated files are committed because the API package is built with `rootDir: src` and the Service Worker is a static asset; they are outputs, not authoring sources.

## Runtime ownership

| Runtime | Mechanism | Policy owner |
|---|---|---|
| Web | TanStack Query, Next Data Cache, browser Service Worker | shared policy + cache contract |
| API | Redis/SWR, HTTP Cache-Control, domain invalidation | shared policy + cache contract |
| Mobile | SQLite public snapshots, file image cache, in-memory freshness | shared policy |
| Mobile mutations | owner-scoped private invalidation and public read-model invalidation | `mobileMutationInvalidation` in shared cache contract |
| Cloudflare Worker | Cache API, reference KV/D1, negative cache, control-plane snapshots | generated Worker policy from shared policy |

## Security invariants

- Personal and private HTTP responses remain `no-store` / private as their route middleware requires; this policy does not make them publicly cacheable.
- Mobile private-cache deletion always requires an owner ID. A missing owner ID never broadens deletion across accounts.
- Explicit saved-offline resources remain separate from expiring public snapshots.
- Pinned/referenced offline images are not removed by disposable image-cache pruning.
- Cloudflare long-lived reference caching remains opt-in behind the existing purge-readiness gate. This change only centralizes its thresholds; it does not enable that mode.

## Useful checks

```bash
pnpm cache:sync
pnpm cache:layer-audit
npm --prefix frontend run cache:contract-audit
npm --prefix frontend run cache:final-audit
node --test apps/mobile/src/storage/__tests__/public-cache-policy.test.mts apps/mobile/src/storage/__tests__/public-image-cache-policy.test.mts
```

The policy centralization preserves the existing cache durations and budgets, except for aligning the Service Worker storage budget with the already-present cache policy test expectations (200 API entries, 300 image entries, 1,200 static entries, 100 MiB static bytes, 600 user-data entries, 80 MiB user-data bytes, 1,500 saved ads, 750 personal shells).


## Deliberately separate Redis expirations

Authentication/session token expiry, distributed-lock leases, presence heartbeats, and durable activity/outbox retention are operational correctness or lifecycle controls rather than response-cache freshness. They are intentionally not redirected through the content-cache policy. Do not shorten or share those expirations with public cache TTLs.
