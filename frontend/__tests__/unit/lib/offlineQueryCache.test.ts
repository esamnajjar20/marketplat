import { describe, expect, it } from 'vitest';
import { isOfflinePersistableQueryKey, selectPersistableQueries, OFFLINE_QUERY_MAX_ENTRY_BYTES, OFFLINE_QUERY_MAX_AGE_MS } from '@/lib/offlineQueryCache';

describe('offline query cache safety and limits', () => {
  it('allows public catalog/home but excludes private, notification, message and search keys', () => {
    expect(isOfflinePersistableQueryKey(['products', { page: 1 }])).toBe(true);
    expect(isOfflinePersistableQueryKey(['home', { city: 'gaza' }])).toBe(true);
    for (const key of [['auth', 'me'], ['notifications'], ['messages', 'list'], ['search', { q: 'private phrase' }]]) expect(isOfflinePersistableQueryKey(key)).toBe(false);
  });
  it('enforces defined data, 20KB entry cap and seven-day max age', () => {
    const now = 1_800_000_000_000;
    const rows = selectPersistableQueries([
      { queryKey: ['products', { page: 1 }], state: { data: [{ id: 1 }], dataUpdatedAt: now - 1000 } },
      { queryKey: ['products', { page: 2 }], state: { data: 'x'.repeat(OFFLINE_QUERY_MAX_ENTRY_BYTES + 1), dataUpdatedAt: now } },
      { queryKey: ['products', { page: 3 }], state: { data: ['old'], dataUpdatedAt: now - OFFLINE_QUERY_MAX_AGE_MS - 1 } },
      { queryKey: ['products', { page: 4 }], state: { data: undefined, dataUpdatedAt: now } },
      { queryKey: ['notifications'], state: { data: [{ id: 'private' }], dataUpdatedAt: now } },
    ], now);
    expect(rows).toHaveLength(1); expect(rows[0]?.queryKey).toEqual(['products', { page: 1 }]);
  });
  it('rejects timestamps from the future instead of persisting clock-skewed data', () => {
    const now = 1_800_000_000_000;
    const rows = selectPersistableQueries([
      { queryKey: ['products', { page: 1 }], state: { data: ['future'], dataUpdatedAt: now + 60_001 } },
      { queryKey: ['products', { page: 2 }], state: { data: ['small-skew'], dataUpdatedAt: now + 30_000 } },
    ], now);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.queryKey).toEqual(['products', { page: 2 }]);
  });
  it('uses stable identities despite object property order', () => {
    const now = 1_800_000_000_000;
    const rows = selectPersistableQueries([
      { queryKey: ['products', { page: 1, limit: 20 }], state: { data: ['a'], dataUpdatedAt: now } },
      { queryKey: ['products', { limit: 20, page: 1 }], state: { data: ['b'], dataUpdatedAt: now - 1 } },
    ], now);
    expect(rows[0]?.id).toBe(rows[1]?.id);
  });
});
