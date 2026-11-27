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

function expectRecommendationParams(query: string | undefined) {
  const [url, config] = (apiClient.get as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [string, { params?: unknown }];
  expect(url).toBe('/recommendations');
  if (query === undefined) {
    expect(config.params).toBeUndefined();
    return;
  }
  expect(config.params).toBeInstanceOf(URLSearchParams);
  expect((config.params as URLSearchParams).toString()).toBe(query);
}

beforeEach(() => {
  vi.clearAllMocks();
  (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { success: true, data: [] } });
});

describe('recommendationsApi.getRecommendations (ads — existing contract)', () => {
  it('calls /recommendations with no type param', async () => {
    await recommendationsApi.getRecommendations({ limit: 8 });
    expectRecommendationParams('limit=8');
  });

  it('works with no params at all, same as before', async () => {
    await recommendationsApi.getRecommendations();
    expect(apiClient.get).toHaveBeenCalledWith('/recommendations', { params: undefined });
  });

  it('passes excludeAdId through unchanged', async () => {
    await recommendationsApi.getRecommendations({ excludeAdId: 'ad-1' });
    expectRecommendationParams('excludeAdId=ad-1');
  });
});

describe('recommendationsApi.getProductRecommendations', () => {
  it('sends type=product with limit and excludeProductId', async () => {
    await recommendationsApi.getProductRecommendations({ limit: 8, excludeProductId: 'prod-1' });
    expectRecommendationParams('limit=8&excludeProductId=prod-1&type=product');
  });

  it('sends type=product even with no other params', async () => {
    await recommendationsApi.getProductRecommendations();
    expectRecommendationParams('type=product');
  });
});

describe('recommendationsApi.getServiceRecommendations', () => {
  it('sends type=service with limit and excludeServiceListingId', async () => {
    await recommendationsApi.getServiceRecommendations({
      limit: 8,
      excludeServiceListingId: 'svc-1',
    });
    expectRecommendationParams('limit=8&excludeServiceListingId=svc-1&type=service');
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
    expectRecommendationParams('limit=6&excludeStoreId=store-1&lat=31.5&lng=34.4&type=store');
  });

  it('omits lat/lng entirely when coordinates are unavailable', async () => {
    await recommendationsApi.getStoreRecommendations({ limit: 6, excludeStoreId: 'store-1' });
    expectRecommendationParams('limit=6&excludeStoreId=store-1&type=store');
  });
});

describe('recommendationsApi.getMixedRecommendations (RECS-MIXED-01)', () => {
  it('sends type=mixed with the per-type limit and city', async () => {
    await recommendationsApi.getMixedRecommendations({ limit: 3, city: 'غزة' });
    expectRecommendationParams('limit=3&city=%D8%BA%D8%B2%D8%A9&type=mixed');
  });

  it('sends type=mixed even with no other params', async () => {
    await recommendationsApi.getMixedRecommendations();
    expectRecommendationParams('type=mixed');
  });
});
