import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(async () => {
  const { createSqliteMock } = await import('./helpers/sqlite-mock');
  return createSqliteMock();
});

vi.mock('expo-sqlite', async () => await mock);
vi.mock('@/storage/encrypted-database', async () => ({
  openEncryptedDatabaseAsync: async () => (await mock).openDatabaseAsync('marketplat-private-v2.db'),
}));

import { deletePublicCacheEntriesByPrefix, readPublicCache, writePublicCache } from '@/storage/public-cache';

describe('deletePublicCacheEntriesByPrefix', () => {
  beforeEach(async () => { (await mock)._clearAll(); });

  it('deletes only entries inside the requested namespace', async () => {
    await writePublicCache('ads:page=1', { items: [1] });
    await writePublicCache('ads:page=2', { items: [2] });
    await writePublicCache('ad-detail:ad-1', { id: 'ad-1' });
    await deletePublicCacheEntriesByPrefix('ads:');

    await expect(readPublicCache('ads:page=1')).resolves.toBeNull();
    await expect(readPublicCache('ads:page=2')).resolves.toBeNull();
    await expect(readPublicCache('ad-detail:ad-1')).resolves.toEqual({ id: 'ad-1' });
  });

  it('treats SQL wildcard characters in prefixes literally', async () => {
    await writePublicCache('ads%:page=1', { value: 1 });
    await writePublicCache('adsX:page=1', { value: 2 });
    await deletePublicCacheEntriesByPrefix('ads%:');

    await expect(readPublicCache('ads%:page=1')).resolves.toBeNull();
    await expect(readPublicCache('adsX:page=1')).resolves.toEqual({ value: 2 });
  });
});
