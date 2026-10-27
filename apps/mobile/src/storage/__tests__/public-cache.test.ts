import { describe, it, expect, beforeEach, vi } from 'vitest';

const mock = vi.hoisted(async () => {
  const { createSqliteMock } = await import('./helpers/sqlite-mock');
  return createSqliteMock();
});

vi.mock('expo-sqlite', async () => await mock);

import {
  writePublicCache, readPublicCache, readPublicCacheEntry,
  deletePublicCacheEntry, clearPublicCache, clearPrivateCache, clearPrivateCacheForPrefix,
} from '@/storage/public-cache';

describe('public-cache', () => {
  beforeEach(async () => { (await mock)._clearAll(); });

  it('write + read roundtrip', async () => {
    await writePublicCache('api-public:test-1', { items: [1, 2, 3] });
    expect(await readPublicCache('api-public:test-1')).toEqual({ items: [1, 2, 3] });
  });

  it('updates on same key (ON CONFLICT)', async () => {
    await writePublicCache('api-public:key', { v: 1 });
    await writePublicCache('api-public:key', { v: 2 });
    expect(await readPublicCache('api-public:key')).toEqual({ v: 2 });
  });

  it('readPublicCacheEntry returns savedAt', async () => {
    const before = Date.now();
    await writePublicCache('api-public:ts', { ok: true });
    const after = Date.now();
    const entry = await readPublicCacheEntry<{ ok: boolean }>('api-public:ts');
    expect(entry).not.toBeNull();
    expect(entry!.savedAt).toBeGreaterThanOrEqual(before);
    expect(entry!.savedAt).toBeLessThanOrEqual(after);
  });

  it('readPublicCacheEntry returns null for missing key', async () => {
    expect(await readPublicCacheEntry('nope')).toBeNull();
  });

  it('rejects key > 300 chars (read)', async () => {
    expect(await readPublicCacheEntry('a'.repeat(301))).toBeNull();
  });

  it('silently skips write for key > 300 chars', async () => {
    const k = 'a'.repeat(301);
    await writePublicCache(k, { v: 1 });
    expect(await readPublicCache(k)).toBeNull();
  });

  it('silently skips entry > 500KB', async () => {
    await writePublicCache('api-public:huge', { data: 'x'.repeat(600_000) });
    expect(await readPublicCache('api-public:huge')).toBeNull();
  });

  it('deletePublicCacheEntry removes only target key', async () => {
    await writePublicCache('api-public:a', { v: 1 });
    await writePublicCache('api-public:b', { v: 2 });
    await deletePublicCacheEntry('api-public:a');
    expect(await readPublicCache('api-public:a')).toBeNull();
    expect(await readPublicCache('api-public:b')).toEqual({ v: 2 });
  });

  it('clearPrivateCache removes only api-private:*', async () => {
    await writePublicCache('api-public:a', { v: 1 });
    await writePublicCache('api-private:user1:/users/me', { name: 'A' });
    await writePublicCache('api-private:user2:/orders', { list: [] });
    await clearPrivateCache();
    expect(await readPublicCache('api-public:a')).toEqual({ v: 1 });
    expect(await readPublicCache('api-private:user1:/users/me')).toBeNull();
    expect(await readPublicCache('api-private:user2:/orders')).toBeNull();
  });

  it('clearPrivateCacheForPrefix scopes by ownerId AND prefix (Phase 2 fix)', async () => {
    await writePublicCache('api-private:user1:/api/v1/orders/1', { a: 1 });
    await writePublicCache('api-private:user1:/api/v1/users/me', { name: 'A' });
    await writePublicCache('api-private:user2:/api/v1/orders/2', { b: 2 });
    await writePublicCache('api-public:public-key', { p: 1 });
    await clearPrivateCacheForPrefix('/api/v1/orders', 'user1');
    expect(await readPublicCache('api-private:user1:/api/v1/orders/1')).toBeNull();
    expect(await readPublicCache('api-private:user1:/api/v1/users/me')).toEqual({ name: 'A' });
    expect(await readPublicCache('api-private:user2:/api/v1/orders/2')).toEqual({ b: 2 });
    expect(await readPublicCache('api-public:public-key')).toEqual({ p: 1 });
  });

  it('clearPrivateCacheForPrefix with invalid prefix does nothing', async () => {
    await writePublicCache('api-private:user1:/api/v1/orders/1', { a: 1 });
    await clearPrivateCacheForPrefix('not-a-valid-prefix', 'user1');
    expect(await readPublicCache('api-private:user1:/api/v1/orders/1')).toEqual({ a: 1 });
  });

  it('clearPublicCache empties entire table', async () => {
    await writePublicCache('api-public:a', { v: 1 });
    await writePublicCache('api-private:user1:/x', { v: 2 });
    await clearPublicCache();
    expect(await readPublicCache('api-public:a')).toBeNull();
    expect(await readPublicCache('api-private:user1:/x')).toBeNull();
  });
});
