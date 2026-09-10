/**
 * __tests__/unit/api/favorite-lists.api.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { favoriteListsApi } from '@/api/favorite-lists.api';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('favoriteListsApi', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.post).mockReset();
    vi.mocked(apiClient.patch).mockReset();
    vi.mocked(apiClient.delete).mockReset();
  });

  it('list() returns data array (or empty)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [
          {
            id: 'l1',
            name: 'سيارات',
            sortOrder: 0,
            itemsCount: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    const result = await favoriteListsApi.list();
    expect(apiClient.get).toHaveBeenCalledWith('/favorites/lists');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('سيارات');
  });

  it('list() falls back to empty array when data is null', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: null } });
    await expect(favoriteListsApi.list()).resolves.toEqual([]);
  });

  it('create() posts name payload', async () => {
    const created = {
      id: 'l2',
      name: 'هواتف',
      sortOrder: 1,
      itemsCount: 0,
      createdAt: '2026-01-02T00:00:00.000Z',
    };
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: created } });

    const result = await favoriteListsApi.create({ name: 'هواتف' });
    expect(apiClient.post).toHaveBeenCalledWith('/favorites/lists', { name: 'هواتف' });
    expect(result).toEqual(created);
  });

  it('rename() patches list id', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { id: 'l1', name: 'جديد' } },
    });

    await favoriteListsApi.rename('l1', { name: 'جديد' });
    expect(apiClient.patch).toHaveBeenCalledWith('/favorites/lists/l1', { name: 'جديد' });
  });

  it('remove() deletes list id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({ data: { data: null } });
    await favoriteListsApi.remove('l1');
    expect(apiClient.delete).toHaveBeenCalledWith('/favorites/lists/l1');
  });

  it('moveFavorite() patches favorite item list', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: {} } });
    await favoriteListsApi.moveFavorite('fav-1', { listId: 'l2' });
    expect(apiClient.patch).toHaveBeenCalledWith('/favorites/items/fav-1/list', {
      listId: 'l2',
    });
  });
});
