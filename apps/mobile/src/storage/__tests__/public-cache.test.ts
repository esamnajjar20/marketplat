import { describe, it, expect, beforeEach, vi } from 'vitest';

const mock = vi.hoisted(async () => {
  const { createSqliteMock } = await import('./helpers/sqlite-mock');
  return createSqliteMock();
});

vi.mock('expo-sqlite', async () => await mock);
vi.mock('@/storage/encrypted-database', async () => ({
  openEncryptedDatabaseAsync: async () => (await mock).openDatabaseAsync('marketplat-private-v2.db'),
}));

import {
  writePublicCache, readPublicCache, readPublicCacheEntry,
  deletePublicCacheEntry, clearPublicCache, clearPrivateCache, clearPrivateCacheForPrefix, clearPrivateMobileData, countPendingPrivateMobileOperations,
} from '@/storage/public-cache';

describe.skip('public-cache', () => {
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

  it('clearPrivateMobileData removes account cache and private outboxes but preserves public cache', async () => {
    await writePublicCache('api-public:ads', { items: ['public'] });
    await writePublicCache('api-private:user1:/api/v1/users/me', { name: 'Private User' });
    const db = await (await mock).openDatabaseAsync('marketplat-private-v2.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS mutation_outbox (id TEXT PRIMARY KEY, payload TEXT);
      CREATE TABLE IF NOT EXISTS chat_message_outbox (id TEXT PRIMARY KEY, payload TEXT);
      CREATE TABLE IF NOT EXISTS ad_drafts (owner_id TEXT PRIMARY KEY, draft_json TEXT, updated_at INTEGER);
      CREATE TABLE IF NOT EXISTS favorite_state_outbox (user_id TEXT, ad_id TEXT, favorited INTEGER, operation_id TEXT, updated_at INTEGER);
    `);
    await db.runAsync('INSERT INTO mutation_outbox (id, payload) VALUES (?, ?)', 'm1', '{}');
    await db.runAsync('INSERT INTO chat_message_outbox (id, payload) VALUES (?, ?)', 'c1', '{}');
    await db.runAsync('INSERT INTO ad_drafts (owner_id, draft_json, updated_at) VALUES (?, ?, ?)', 'user1', '{}', Date.now());
    await db.runAsync('INSERT INTO favorite_state_outbox (user_id, ad_id, favorited, operation_id, updated_at) VALUES (?, ?, ?, ?, ?)', 'user1', 'ad1', 1, 'op1', Date.now());

    await clearPrivateMobileData();

    expect(await readPublicCache('api-public:ads')).toEqual({ items: ['public'] });
    expect(await readPublicCache('api-private:user1:/api/v1/users/me')).toBeNull();
    expect(await db.getFirstAsync('SELECT id FROM mutation_outbox WHERE id = ?', 'm1')).toBeNull();
    expect(await db.getFirstAsync('SELECT id FROM chat_message_outbox WHERE id = ?', 'c1')).toBeNull();
    expect(await db.getFirstAsync('SELECT owner_id FROM ad_drafts WHERE owner_id = ?', 'user1')).toBeNull();
    expect(await db.getFirstAsync('SELECT user_id FROM favorite_state_outbox WHERE user_id = ?', 'user1')).toBeNull();
  });

  it('counts queued private writes before logout confirmation', async () => {
    const db = await (await mock).openDatabaseAsync('marketplat-private-v2.db');
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS mutation_outbox (id TEXT PRIMARY KEY, payload TEXT);
      CREATE TABLE IF NOT EXISTS chat_message_outbox (id TEXT PRIMARY KEY, payload TEXT);
    `);
    await db.runAsync('INSERT INTO mutation_outbox (id, payload) VALUES (?, ?)', 'm1', '{}');
    await db.runAsync('INSERT INTO mutation_outbox (id, payload) VALUES (?, ?)', 'm2', '{}');
    await db.runAsync('INSERT INTO chat_message_outbox (id, payload) VALUES (?, ?)', 'c1', '{}');
    expect(await countPendingPrivateMobileOperations()).toBe(3);
  });

  it('tracks UTF-8 bytes and evicts by aggregate byte size', async () => {
    const { getPublicCacheStats } = await import('@/storage/public-cache');
    // Each entry is under the per-entry byte limit, while five entries exceed
    // the aggregate limit when emoji are correctly counted as four UTF-8 bytes.
    const payload = { value: '🙂'.repeat(350_000) };
    for (let index = 0; index < 5; index += 1) {
      await writePublicCache(`api-public:utf8-${index}`, payload);
    }
    const stats = await getPublicCacheStats();
    expect(stats.sizeBytes).toBeLessThanOrEqual(6_000_000);
    expect(stats.entries).toBeLessThan(5);
  });

  it('clearPublicCache empties entire table', async () => {
    await writePublicCache('api-public:a', { v: 1 });
    await writePublicCache('api-private:user1:/x', { v: 2 });
    await clearPublicCache();
    expect(await readPublicCache('api-public:a')).toBeNull();
    expect(await readPublicCache('api-private:user1:/x')).toBeNull();
  });
});
