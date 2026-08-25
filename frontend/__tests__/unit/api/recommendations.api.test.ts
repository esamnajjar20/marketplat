/**
 * __tests__/unit/api/recommendations.api.test.ts
 *
 * PR4C: covers the three new type-specific client functions
 * (getProductRecommendations/getServiceRecommendations/
 * getStoreRecommendations) — each must call the same single
 * GET /recommendations endpoint with the correct `type` + params —
 * and confirms getRecommendations (ads) keeps sending no `type` at
 * all, exactly as before this change.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { recommendationsApi } from '@/api/recommendations.api';
import { apiClient } from '@/api/client';

vi.mock('@/api/client', () => ({
  apiClient: { get: vi.fn() },
}));

beforeEach(() => {
  vi.clearAllMocks();
  (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, data: [] } });
});

describe('recommendationsApi.getRecommendations (ads — existing contract)', () => {
  it('calls /recommendations with no type param', async () => {
    await recommendationsApi.getRecommendations({ limit: 8 });
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', { params: { limit: 8 } });
  });

  it('works with no params at all, same as before', async () => {
    await recommendationsApi.getRecommendations();
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', { params: undefined });
  });

  it('passes excludeAdId through unchanged', async () => {
    await recommendationsApi.getRecommendations({ excludeAdId: 'ad-1' });
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', {
      params: { excludeAdId: 'ad-1' },
    });
  });
});

describe('recommendationsApi.getProductRecommendations', () => {
  it('sends type=product with limit and excludeProductId', async () => {
    await recommendationsApi.getProductRecommendations({ limit: 8, excludeProductId: 'prod-1' });
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', {
      params: { limit: 8, excludeProductId: 'prod-1', type: 'product' },
    });
  });

  it('sends type=product even with no other params', async () => {
    await recommendationsApi.getProductRecommendations();
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', { params: { type: 'product' } });
  });
});

describe('recommendationsApi.getServiceRecommendations', () => {
  it('sends type=service with limit and excludeServiceListingId', async () => {
    await recommendationsApi.getServiceRecommendations({
      limit: 8,
      excludeServiceListingId: 'svc-1',
    });
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', {
      params: { limit: 8, excludeServiceListingId: 'svc-1', type: 'service' },
    });
  });
});

describe('recommendationsApi.getStoreRecommendations', () => {
  it('sends type=store with limit, excludeStoreId, and lat/lng when present', async () => {
    await recommendationsApi.getStoreRecommendations({
      limit: 6,
      excludeStoreId: 'store-1',
      lat: 31.5,
      lng: 34.4,
    });
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', {
      params: { limit: 6, excludeStoreId: 'store-1', lat: 31.5, lng: 34.4, type: 'store' },
    });
  });

  it('omits lat/lng entirely when coordinates are unavailable', async () => {
    await recommendationsApi.getStoreRecommendations({ limit: 6, excludeStoreId: 'store-1' });
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', {
      params: { limit: 6, excludeStoreId: 'store-1', type: 'store' },
    });
  });
});
