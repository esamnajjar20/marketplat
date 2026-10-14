import { describe, expect, it } from 'vitest';
import {
  getOfflineQueryDataBytes,
  mergePersistedQueries,
  isValidOfflineQueryCacheEntry,
  isOfflinePersistableQueryKey,
  selectPersistableQueries,
  OFFLINE_QUERY_MAX_ENTRY_BYTES,
  OFFLINE_QUERY_MAX_AGE_MS,
} from '@/lib/offlineQueryCache';

describe('offline query cache safety and limits', () => {
  it('allows only known public query-key shapes', () => {
    expect(isOfflinePersistableQueryKey(['products', 'list', { page: 1 }])).toBe(true);
    expect(isOfflinePersistableQueryKey(['products', 'detail', 'p-1'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['service-providers', 'provider-1'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['home', 'page', 'gaza'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['categories'])).toBe(true);
    expect(isOfflinePersistableQueryKey(['categories', 'slug', 'electronics'])).toBe(true);
  });

  it('rejects private/admin sibling keys even when their first segment is public', () => {
    const forbidden = [
      ['products', 'me', {}],
      ['products', 'stock', 'summary'],
      ['products', 'admin', 'all'],
      ['ads', 'me', {}],
      ['ads', 'me', 'stats'],
      ['stores', 'me'],
      ['stores', 'followed', {}],
      ['service-providers', 'me'],
      ['service-providers', 'nearby', { lat: 31.5, lng: 34.4 }],
      ['service-providers', 'list', { providerId: 'private-provider' }],
      ['service-listings', 'me', {}],
      ['categories', 'admin', 'all'],
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

  it('rejects query keys containing actual search text or contextual coordinates', () => {
    expect(isOfflinePersistableQueryKey(['products', 'list', { page: 1, search: 'private phrase' }])).toBe(false);
    expect(isOfflinePersistableQueryKey(['ads', 'list', { q: 'secret search' }])).toBe(false);
    expect(isOfflinePersistableQueryKey(['service-providers', 'list', { lat: 31.5, lng: 34.4 }])).toBe(false);
    // Empty/undefined optional filter values do not make an otherwise public key private.
    expect(isOfflinePersistableQueryKey(['products', 'list', { page: 1, search: undefined }])).toBe(true);
  });

  it('enforces a 512 KiB entry cap and seven-day maximum age', () => {
    const now = 1_800_000_000_000;
    expect(OFFLINE_QUERY_MAX_ENTRY_BYTES).toBe(512 * 1024);
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
