/**
 * __tests__/unit/api/stores.api.test.ts
 *
 * Coverage targets (same style as ads.api.test.ts's
 * "endpoint/method correctness" regression guard — pins every
 * endpoint's exact path/method/payload shape so a typo like
 * '/stores/my' instead of '/stores/me' fails a test immediately
 * instead of silently shipping a 404):
 *
 *  - Every storesApi method calls the correct HTTP verb + path
 *  - getAll / getMyFollowedStores / getReviews correctly unwrap the
 *    paginated response shape (via the real unwrapPaginated, not a
 *    mock of it) into { items, meta }
 *  - toggleFollow POSTs with no body (a bare toggle, not a payload)
 *  - createReview / updateStatus send their payload verbatim
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { storesApi } from '@/api/stores.api';
import { apiClient } from '@/api/client';
import type { StoreWithSeller, StoreFollowerWithStore, StoreReview } from '@/types/store.types';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

beforeEach(() => vi.clearAllMocks());

function paginatedResponse<T>(items: T[]) {
  return {
    data: {
      success: true,
      data: items,
      meta: {
        pagination: {
          total: items.length, page: 1, limit: 10,
          totalPages: 1, hasNextPage: false, hasPrevPage: false,
        },
      },
    },
  };
}

describe('storesApi — endpoint/method correctness', () => {
  it('getAll calls GET /stores with query params', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(paginatedResponse([]));
    await storesApi.getAll({ page: 1, city: 'غزة' });
    expect(apiClient.get).toHaveBeenCalledWith('/stores', { params: { page: 1, city: 'غزة' } });
  });

  it('getMyStore calls GET /stores/me (not /stores/my)', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    await storesApi.getMyStore();
    expect(apiClient.get).toHaveBeenCalledWith('/stores/me');
  });

  it('updateMyStore calls PATCH /stores/me with the payload', async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    await storesApi.updateMyStore({ name: 'اسم جديد' });
    expect(apiClient.patch).toHaveBeenCalledWith('/stores/me', { name: 'اسم جديد' });
  });

  it('getMyFollowedStores calls GET /stores/me/followed with params', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(paginatedResponse([]));
    await storesApi.getMyFollowedStores({ page: 2, limit: 12 });
    expect(apiClient.get).toHaveBeenCalledWith('/stores/me/followed', { params: { page: 2, limit: 12 } });
  });

  it('create calls POST /stores with the payload', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    const payload = { name: 'متجري', description: 'وصف طويل بما فيه الكفاية', city: 'غزة', phone: '0599123456' };
    await storesApi.create(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/stores', payload);
  });

  it('getById calls GET /stores/:id', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    await storesApi.getById('store-1');
    expect(apiClient.get).toHaveBeenCalledWith('/stores/store-1');
  });

  it('updateStatus calls PATCH /stores/:id/status with the status payload', async () => {
    (apiClient.patch as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: {} } });
    await storesApi.updateStatus('store-1', { status: 'BLOCKED' });
    expect(apiClient.patch).toHaveBeenCalledWith('/stores/store-1/status', { status: 'BLOCKED' });
  });

  it('toggleFollow calls POST /stores/:id/follow with no body', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: { action: 'followed' } } });
    await storesApi.toggleFollow('store-1');
    // A bare toggle — must not send an accidental empty-object/undefined
    // second arg that could confuse a server expecting no body at all.
    expect(apiClient.post).toHaveBeenCalledWith('/stores/store-1/follow');
  });

  it('getReviews calls GET /stores/:id/reviews with params', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(paginatedResponse([]));
    await storesApi.getReviews('store-1', { page: 1, limit: 10 });
    expect(apiClient.get).toHaveBeenCalledWith('/stores/store-1/reviews', { params: { page: 1, limit: 10 } });
  });

  it('createReview calls POST /stores/:id/reviews with the payload', async () => {
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { data: null } });
    await storesApi.createReview('store-1', { score: 5, comment: 'ممتاز' });
    expect(apiClient.post).toHaveBeenCalledWith('/stores/store-1/reviews', { score: 5, comment: 'ممتاز' });
  });
});

describe('storesApi — paginated response unwrapping', () => {
  const store: StoreWithSeller = {
    id: 's-1', sellerProfileId: 'sp-1', name: 'متجر تجريبي', description: 'وصف',
    logoUrl: null, coverImageUrl: null, city: 'غزة', address: null, phone: '0599000000',
    status: 'ACTIVE', plan: 'FREE', latitude: null, longitude: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    sellerProfile: {
      id: 'sp-1', userId: 'u-1', displayName: 'بائع', bio: null, avatarUrl: null,
      verified: false, verificationStatus: 'UNVERIFIED', verifiedAt: null, trustScore: 0,
      averageRating: '0', totalRatings: 0, totalAds: 0, activeAds: 0, totalSales: 0,
      responseRate: null, responseTimeMinutes: null,
      joinedSellingAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };

  it('getAll returns { items, meta } with the store list under items', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(paginatedResponse([store]));
    const res = await storesApi.getAll();
    expect(res.data.data.items).toEqual([store]);
    expect(res.data.data.meta.total).toBe(1);
  });

  it('getMyFollowedStores returns { items, meta } with follow records under items', async () => {
    const follow: StoreFollowerWithStore = {
      id: 'f-1', userId: 'u-1', storeId: 's-1', createdAt: '2026-01-01T00:00:00.000Z', store,
    };
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(paginatedResponse([follow]));
    const res = await storesApi.getMyFollowedStores();
    expect(res.data.data.items).toEqual([follow]);
  });

  it('getReviews returns { items, meta } with review records under items', async () => {
    const review: StoreReview = {
      id: 'r-1', score: 5, comment: 'ممتاز', sellerProfileId: 'sp-1', raterId: 'u-2',
      createdAt: '2026-01-01T00:00:00.000Z',
      rater: { id: 'u-2', name: 'زائر', avatarUrl: null },
    };
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue(paginatedResponse([review]));
    const res = await storesApi.getReviews('s-1');
    expect(res.data.data.items).toEqual([review]);
  });

  it('getAll defaults meta to empty pagination when the response has no meta.pagination', async () => {
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, data: [] } });
    const res = await storesApi.getAll();
    expect(res.data.data.items).toEqual([]);
    expect(res.data.data.meta.total).toBe(0);
    expect(res.data.data.meta.totalPages).toBe(0);
  });
});
