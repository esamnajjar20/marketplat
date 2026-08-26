import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/api/client';
import { promotionsApi } from '@/api/promotions.api';
import { badgesApi } from '@/api/badges.api';
import { collectionsApi } from '@/api/collections.api';
import { savedSearchesApi } from '@/api/savedSearches.api';
vi.mock('@/api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
function mockPlain(data: unknown = null) { return { data: { success: true, message: 'ok', data } }; }
beforeEach(() => {
  vi.clearAllMocks();
  for (const m of ['get','post','patch','delete'] as const) (apiClient[m] as any).mockResolvedValue(mockPlain(null));
});
describe('promotionsApi', () => {
  it('paths', async () => {
    await promotionsApi.create({} as any);
    expect(apiClient.post).toHaveBeenCalledWith('/promotions', {});
    await promotionsApi.getMine();
    expect(apiClient.get).toHaveBeenCalledWith('/promotions/me');
    await promotionsApi.getById('p1');
    expect(apiClient.get).toHaveBeenCalledWith('/promotions/p1');
    await promotionsApi.update('p1', {} as any);
    expect(apiClient.patch).toHaveBeenCalledWith('/promotions/p1', {});
    await promotionsApi.cancel('p1');
    expect(apiClient.delete).toHaveBeenCalledWith('/promotions/p1');
  });
});
describe('badgesApi', () => {
  it('paths', async () => {
    await badgesApi.getStoreBadges('s1');
    expect(apiClient.get).toHaveBeenCalledWith('/badges/store/s1');
    await badgesApi.getProviderBadges('pr1');
    expect(apiClient.get).toHaveBeenCalledWith('/badges/provider/pr1');
  });
});
describe('collectionsApi', () => {
  it('paths', async () => {
    await collectionsApi.create({} as any);
    await collectionsApi.getMine();
    await collectionsApi.getById('c1');
    await collectionsApi.update('c1', {} as any);
    await collectionsApi.delete('c1');
    await collectionsApi.reorder({} as any);
    await collectionsApi.addProduct('c1','p1');
    await collectionsApi.removeProduct('c1','p1');
    await collectionsApi.getPublicCollections('s1');
    await collectionsApi.getPublicCollectionProducts('c1');
    expect(apiClient.get).toHaveBeenCalledWith('/collections/me');
    expect(apiClient.get).toHaveBeenCalledWith('/collections/store/s1');
  });
});
describe('savedSearchesApi', () => {
  it('paths', async () => {
    (apiClient.get as any).mockResolvedValue(mockPlain([{ id: 'ss1' }]));
    expect(await savedSearchesApi.getAll()).toEqual([{ id: 'ss1' }]);
    (apiClient.post as any).mockResolvedValue(mockPlain({ id: 'ss1' }));
    expect(await savedSearchesApi.create({} as any)).toEqual({ id: 'ss1' });
    await savedSearchesApi.delete('ss1');
    expect(apiClient.delete).toHaveBeenCalledWith('/saved-searches/ss1');
  });
});
