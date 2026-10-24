import { describe, expect, it } from 'vitest';
import {
  getOfflineQueryDataBytes,
  mergePersistedQueries,
  isValidOfflineQueryCacheEntry,
  isOfflinePersistableQueryKey,
  selectPersistableQueries,
  OFFLINE_QUERY_MAX_ENTRY_BYTES,
  OFFLINE_HOME_FEED_MAX_ENTRY_BYTES,
  OFFLINE_QUERY_MAX_AGE_MS,
} from '@/lib/offlineQueryCache';

describe('offline query cache safety and limits', () => {
  it('allows only known public query-key shapes', () => {
    expect(isOfflinePersistableQueryKey(['products', 'list', { page: 1 }])).toBe(true);
    expect(isOfflinePersistableQueryKey(['products', 'detail', 'p-1'])).toBe(true);
    // Match the real queryKeys.ads.infinite(mode, params) factory shape.
    expect(isOfflinePersistableQueryKey(['ads', 'infinite', 'browse', { city: 'gaza', pageSize: 24 }])).toBe(true);
    expect(isOfflinePersistableQueryKey(['service-providers', 'provider-1'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['sellers', 'seller-1'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['sellers', 'ranking', 20])).toBe(true);
    expect(isOfflinePersistableQueryKey(['sellers', 'seller-1', 'ratings', { page: 1, limit: 20 }])).toBe(true);
    expect(isOfflinePersistableQueryKey(['sellers', 'seller-1', 'ratings', {}])).toBe(true);
    expect(isOfflinePersistableQueryKey(['users', 'user-1'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['users', 'user-1', 'ads', { page: 1, limit: 20 }])).toBe(true);
    expect(isOfflinePersistableQueryKey(['public-store-sales-stats', 'store-slug'])).toBe(true);
    // The open requests marketplace is public and viewer-independent.
    expect(isOfflinePersistableQueryKey(['requests', 'open', { page: 1, limit: 20, type: 'PRODUCT' }])).toBe(true);
    expect(isOfflinePersistableQueryKey(['home', 'page', 'gaza'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['categories'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['categories', 'slug', 'electronics'])).toBe(true);
    // Public store-type reference data is needed by filters and dynamic forms.
    expect(isOfflinePersistableQueryKey(['store-types'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['store-types', 'fields', 'retail'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['store-types', 'fields', 'store-type-uuid'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['store-types', 'fields', 'admin:retail'])).toBe(false);
    expect(isOfflinePersistableQueryKey(['store-types', 'admin', 'all'])).toBe(false);
    expect(isOfflinePersistableQueryKey(['service-listing-matches', 'listing-123'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['service-listing-matches', 'admin'])).toBe(false);
    expect(isOfflinePersistableQueryKey(['service-listing-matches', 'listing-123', { userId: 'user-1' }])).toBe(false);
  });

  it('persists public store-type reference data but excludes admin editor fields', () => {
    const now = 1_800_000_000_000;
    const rows = selectPersistableQueries([
      { queryKey: ['store-types'], state: { data: [{ id: 'retail', name: 'متجر تجزئة' }], dataUpdatedAt: now } },
      { queryKey: ['store-types', 'fields', 'retail'], state: { data: [{ id: 'color', label: 'اللون' }], dataUpdatedAt: now } },
      { queryKey: ['store-types', 'fields', 'admin:retail'], state: { data: [{ id: 'internal', label: 'حقل إداري' }], dataUpdatedAt: now } },
    ], now);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.queryKey)).toEqual([
      ['store-types'],
      ['store-types', 'fields', 'retail'],
    ]);
  });

  it('persists the real ads browse infinite query but never persists search-mode results', () => {
    const now = 1_800_000_000_000;
    const rows = selectPersistableQueries([
      { queryKey: ['ads', 'infinite', 'browse', { city: 'gaza', pageSize: 24, q: undefined }], state: { data: [{ id: 'public-ad' }], dataUpdatedAt: now } },
      { queryKey: ['ads', 'infinite', 'search', { city: 'gaza', pageSize: 24, q: 'private phrase' }], state: { data: [{ id: 'searched-ad' }], dataUpdatedAt: now } },
    ], now);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.queryKey).toEqual(['ads', 'infinite', 'browse', { city: 'gaza', pageSize: 24, q: undefined }]);
  });

  it('rejects private/admin sibling keys even when their first segment is public', () => {
    const forbidden = [
      ['products', 'me', {}],
      ['products', 'stock', 'summary'],
      ['products', 'admin', 'all'],
      ['ads', 'me', {}],
      ['ads', 'me', 'stats'],
      ['ads', 'infinite', 'search', { q: 'private phrase' }],
      ['ads', 'infinite', 'browse', { q: 'private phrase' }],
      ['ads', 'infinite', { page: 1 }],
      ['stores', 'me'],
      ['stores', 'followed', {}],
      ['service-providers', 'me'],
      ['sellers', 'me'],
      ['sellers', 'admin'],
      ['sellers', 'ranking', 1000],
      ['sellers', 'me', 'ratings', { page: 1 }],
      ['sellers', 'admin', 'ratings', { page: 1 }],
      ['sellers', 'seller-1', 'ratings', { q: 'private phrase' }],
      ['sellers', 'seller-1', 'ratings', { page: 1, ownerId: 'private-user' }],
      ['sellers', 'seller-1', 'ratings', { page: 0 }],
      ['sellers', 'seller-1', 'ratings', { limit: 5000 }],
      ['users', 'me'],
      ['users', 'admin'],
      ['users', 'user-1', 'ads', { q: 'private phrase' }],
      // Recommendations can be personalized by the bearer token even when
      // a caller labels the key as guest, so they are intentionally excluded.
      ['recommendations', { limit: 8 }, 'guest'],
      ['recommendations', 'product', { limit: 8 }, 'user'],
      ['service-providers', 'nearby', { lat: 31.5, lng: 34.4 }],
      ['service-providers', 'list', { providerId: 'private-provider' }],
      ['service-listings', 'me', {}],
      // Request details vary by viewer (owner sees all offers, other users
      // see only their own, anonymous users see none), so never persist them.
      ['requests', 'detail', 'request-1'],
      ['requests', 'me', { page: 1 }],
      ['requests', 'my-offers', { page: 1 }],
      ['requests', 'open', { page: 1, q: 'private phrase' }],
      ['requests', 'open', { city: 'gaza', lat: 31.5, lng: 34.4 }],
      ['categories', 'admin', 'all'],
      ['store-types', 'admin', 'all'],
      ['store-types', 'fields', 'admin:store-type-1'],
      ['store-types', 'fields', ''],
      ['product-categories', 'admin', 'all'],
      ['service-categories', 'admin', 'all'],
      ['service-types', 'admin', 'all'],
      ['search', 'unified', { q: 'private phrase' }],
      ['home', 'unknown-branch', { city: 'gaza' }],
    ];
    for (const key of forbidden) expect(isOfflinePersistableQueryKey(key)).toBe(false);
    // CACHE-OFFLINE-HOME-FEED-01: home.feed is intentionally persistable
    // (per-user key; cleared on logout).
    expect(isOfflinePersistableQueryKey(['home', 'feed', 'gaza', 'user-123'])).toBe(true);
  });

  it('persists public store/service reviews, storefront collections, collection products, and badges only', () => {
    const publicKeys = [
      ['store-reviews', 'store-1', { page: 1, limit: 20 }],
      ['service-reviews', 'seller', 'seller-1', { page: 2, limit: 10 }],
      ['collections', 'store', 'store-1'],
      ['collections', 'collection-1', 'products'],
      ['badges', 'store', 'store-1'],
      ['badges', 'provider', 'provider-1'],
    ];
    for (const key of publicKeys) expect(isOfflinePersistableQueryKey(key)).toBe(true);

    const forbiddenKeys = [
      ['store-reviews', 'store-1', { page: 1, ownerId: 'user-1' }],
      ['service-reviews', 'seller', 'seller-1', { q: 'private phrase' }],
      ['collections', 'me'],
      ['collections', 'me', 'products'],
      ['collections', 'detail', 'collection-1'],
      ['badges', 'admin', 'all'],
      ['badges', 'store', ''],
    ];
    for (const key of forbiddenKeys) expect(isOfflinePersistableQueryKey(key)).toBe(false);
  });

  it('persists public open-request feeds but rejects viewer-dependent request details', () => {
    const now = 1_800_000_000_000;
    const rows = selectPersistableQueries([
      { queryKey: ['requests', 'open', { page: 1, limit: 20, type: 'PRODUCT' }], state: { data: { items: [{ id: 'public-request' }] }, dataUpdatedAt: now } },
      { queryKey: ['requests', 'detail', 'request-1'], state: { data: { id: 'request-1', offers: [{ price: 5, message: 'private offer' }] }, dataUpdatedAt: now } },
      { queryKey: ['requests', 'open', { q: 'private phrase' }], state: { data: { items: [] }, dataUpdatedAt: now } },
    ], now);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.queryKey).toEqual(['requests', 'open', { page: 1, limit: 20, type: 'PRODUCT' }]);
  });

  it('rejects query keys containing actual search text or contextual coordinates', () => {
    expect(isOfflinePersistableQueryKey(['products', 'list', { page: 1, search: 'private phrase' }])).toBe(false);
    expect(isOfflinePersistableQueryKey(['ads', 'list', { q: 'secret search' }])).toBe(false);
    expect(isOfflinePersistableQueryKey(['service-providers', 'list', { lat: 31.5, lng: 34.4 }])).toBe(false);
    // Empty/undefined optional filter values do not make an otherwise public key private.
    expect(isOfflinePersistableQueryKey(['products', 'list', { page: 1, search: undefined }])).toBe(true);
  });

  it('keeps ordinary queries capped at 768 KiB and allows the unified home feed up to 3 MiB', () => {
    const now = 1_800_000_000_000;
    expect(OFFLINE_QUERY_MAX_ENTRY_BYTES).toBe(768 * 1024);
    expect(OFFLINE_HOME_FEED_MAX_ENTRY_BYTES).toBe(3 * 1024 * 1024);
    const payload = 'x'.repeat(800 * 1024);
    const rows = selectPersistableQueries([
      { queryKey: ['home', 'feed', null, 'guest'], state: { data: payload, dataUpdatedAt: now } },
      { queryKey: ['products', 'list', { page: 1 }], state: { data: payload, dataUpdatedAt: now } },
    ], now);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.queryKey).toEqual(['home', 'feed', null, 'guest']);
    expect(isValidOfflineQueryCacheEntry(rows[0], now)).toBe(true);
  });

  it('enforces the ordinary 768 KiB entry cap and seven-day maximum age', () => {
    const now = 1_800_000_000_000;
    expect(OFFLINE_QUERY_MAX_ENTRY_BYTES).toBe(768 * 1024);
    const rows = selectPersistableQueries([
      { queryKey: ['products', 'list', { page: 1 }], state: { data: [{ id: 1 }], dataUpdatedAt: now - 1000 } },
      { queryKey: ['products', 'list', { page: 2 }], state: { data: 'x'.repeat(30 * 1024), dataUpdatedAt: now } },
      { queryKey: ['products', 'list', { page: 3 }], state: { data: 'x'.repeat(OFFLINE_QUERY_MAX_ENTRY_BYTES + 1), dataUpdatedAt: now } },
      { queryKey: ['products', 'list', { page: 4 }], state: { data: ['old'], dataUpdatedAt: now - OFFLINE_QUERY_MAX_AGE_MS - 1 } },
      { queryKey: ['products', 'list', { page: 5 }], state: { data: undefined, dataUpdatedAt: now } },
      { queryKey: ['notifications'], state: { data: [{ id: 'private' }], dataUpdatedAt: now } },
    ], now);
    expect(rows).toHaveLength(2);
    expect(rows.some((row) => row.queryKey[1] === 'list' && (row.queryKey[2] as { page?: number }).page === 2)).toBe(true);
    expect(rows.some((row) => row.queryKey[1] === 'list' && (row.queryKey[2] as { page?: number }).page === 1)).toBe(true);
  });

  it('rejects timestamps from the future instead of persisting clock-skewed data', () => {
    const now = 1_800_000_000_000;
    const rows = selectPersistableQueries([
      { queryKey: ['products', 'list', { page: 1 }], state: { data: ['future'], dataUpdatedAt: now + 60_001 } },
      { queryKey: ['products', 'list', { page: 2 }], state: { data: ['small-skew'], dataUpdatedAt: now + 30_000 } },
    ], now);
    expect(rows).toHaveLength(1);
    expect((rows[0]?.queryKey[2] as { page?: number }).page).toBe(2);
  });

  it('uses stable identities despite object property order', () => {
    const now = 1_800_000_000_000;
    const rows = selectPersistableQueries([
      { queryKey: ['products', 'list', { page: 1, limit: 20 }], state: { data: ['a'], dataUpdatedAt: now } },
      { queryKey: ['products', 'list', { limit: 20, page: 1 }], state: { data: ['b'], dataUpdatedAt: now - 1 } },
    ], now);
    expect(rows[0]?.id).toBe(rows[1]?.id);
  });

  it('calculates actual UTF-8 serialized payload size and safely rejects unserializable values', () => {
    expect(getOfflineQueryDataBytes('x'.repeat(30 * 1024))).toBe(30 * 1024 + 2);
    expect(getOfflineQueryDataBytes({ title: 'مرحبا' })).toBeGreaterThan(0);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(getOfflineQueryDataBytes(circular)).toBeNull();
  });

  it('rejects corrupted persisted rows when stored bytes do not match the actual payload', () => {
    const now = 1_800_000_000_000;
    const [valid] = selectPersistableQueries([
      { queryKey: ['products', 'list', { page: 1 }], state: { data: { title: 'small payload' }, dataUpdatedAt: now } },
    ], now);
    expect(valid).toBeDefined();
    if (!valid) return;
    expect(isValidOfflineQueryCacheEntry(valid, now)).toBe(true);
    expect(isValidOfflineQueryCacheEntry({ ...valid, bytes: valid.bytes + 1 }, now)).toBe(false);
    expect(isValidOfflineQueryCacheEntry({ ...valid, data: 'x'.repeat(OFFLINE_QUERY_MAX_ENTRY_BYTES + 1) }, now)).toBe(false);
    expect(isValidOfflineQueryCacheEntry({ ...valid, savedAt: now + 60_001 }, now)).toBe(false);
    expect(isValidOfflineQueryCacheEntry({ ...valid, queryKey: ['products', 'me', {}] }, now)).toBe(false);
  });

  // REGRESSION (FIX OFFLINE-PERSIST-MERGE-01): persisting used to clear the
  // store and rewrite only what was still in memory, so GC of an unobserved
  // query (gcTime = 10 min) also deleted its IndexedDB snapshot.
  describe('mergePersistedQueries', () => {
    const now = 1_800_000_000_000;
    const row = (page: number, dataUpdatedAt: number, data: unknown = [{ page }]) => {
      const [entry] = selectPersistableQueries([
        { queryKey: ['products', 'list', { page }], state: { data, dataUpdatedAt } },
      ], now);
      return entry!;
    };

    it('keeps valid persisted rows that are no longer in memory', () => {
      const persistedOnly = row(1, now - 60_000);
      const inMemory = row(2, now - 1_000);
      const merged = mergePersistedQueries([persistedOnly], [inMemory], now);
      expect(merged.map((e) => (e.queryKey[2] as { page: number }).page).sort()).toEqual([1, 2]);
    });

    it('lets in-memory data win for the same key', () => {
      const old = row(1, now - 60_000, ['old']);
      const fresh = row(1, now - 1_000, ['fresh']);
      const merged = mergePersistedQueries([old], [fresh], now);
      expect(merged).toHaveLength(1);
      expect(merged[0]!.data).toEqual(['fresh']);
    });

    it('drops expired or corrupt persisted rows and ignores the meta record', () => {
      const expired = { ...row(1, now - 1_000), dataUpdatedAt: now - OFFLINE_QUERY_MAX_AGE_MS - 1 };
      const corrupt = { ...row(2, now - 1_000), bytes: 1 };
      const meta = { id: '__meta__', savedAt: now, bytes: 10 };
      expect(mergePersistedQueries([expired, corrupt, meta, null, 'junk'], [], now)).toEqual([]);
    });
  });

});
