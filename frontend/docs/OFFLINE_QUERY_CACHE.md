# Offline-First Query Cache

## Behaviour

The browser QueryClient asynchronously restores recent public read-query snapshots from IndexedDB and persists successful public query results after a short debounce. Restore never overwrites a query with newer in-memory data, and failure to open/write IndexedDB never blocks application startup or normal network queries.

## Safety boundary

The allowlist is derived from `lib/cache/cache-contract.json` domains with `scope: public`, excluding `search` because query keys may contain private search terms. Auth/profile, recommendations, seller/provider self data, admin data, notifications, conversations, messages, mutations and unknown query-key prefixes are not persisted. Logout clears the IndexedDB snapshot store and its freshness marker as defense in depth. IndexedDB is not encrypted and must not be treated as a secure store.

## Limits

- Maximum entry: 20 KiB of serialized query data.
- Maximum records: 500.
- Maximum aggregate data budget: 5 MiB.
- Maximum age: 7 days.
- Eviction priority: newest successful data first (oldest entries fall off first).
- Query-key identity: deterministic JSON serialization with sorted object keys.

The UI's existing network banner shows the approximate timestamp of the latest persisted query data when offline. A first-time user, expired cache, unsupported browser, or failed IndexedDB access continues through the existing loading/error flow; this feature cannot manufacture data that was never fetched.

## Validation

`__tests__/unit/lib/offlineQueryCache.test.ts` covers the public/private boundary, search exclusion, age/size limits, and stable query-key identity. Run `npm test -- __tests__/unit/lib/offlineQueryCache.test.ts` from `frontend/` after installing dependencies.
