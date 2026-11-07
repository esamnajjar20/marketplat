import { publicMutationCacheTags } from '../../src/shared/cache/publicMutationTags';

describe('publicMutationCacheTags', () => {
  it('does not invalidate on reads or unsupported methods', () => {
    expect(publicMutationCacheTags('GET', '/api/v1/ads')).toEqual([]);
    expect(publicMutationCacheTags('OPTIONS', '/api/v1/products')).toEqual([]);
    expect(publicMutationCacheTags('PATCH', '/api/v1/users/me')).toEqual([]);
  });

  it('invalidates ad lists, search and homepage on public ad writes', () => {
    expect(publicMutationCacheTags('POST', '/api/v1/ads')).toEqual([
      'route:ads', 'route:home', 'route:search',
    ]);
  });

  it('adds a validated entity tag for a detail mutation', () => {
    expect(publicMutationCacheTags('PATCH', '/api/v1/products/product_123?from=admin')).toEqual([
      'route:products', 'route:collections', 'route:home', 'route:search', 'product:product_123',
    ]);
  });

  it('invalidates unified search when products, stores, or services change', () => {
    for (const [method, path] of [
      ['PATCH', '/api/v1/products/product-7'],
      ['PATCH', '/api/v1/stores/store-7'],
      ['PATCH', '/api/v1/service-listings/service-7'],
      ['PATCH', '/api/v1/service-providers/provider-7'],
      ['PATCH', '/api/v1/sellers/seller-7'],
    ]) {
      expect(publicMutationCacheTags(method, path)).toContain('route:search');
    }
  });

  it('invalidates the public request feed for request and offer lifecycle mutations', () => {
    for (const [method, path] of [
      ['POST', '/api/v1/requests'],
      ['PATCH', '/api/v1/requests/request-1/cancel'],
      ['POST', '/api/v1/requests/request-1/offers'],
      ['DELETE', '/api/v1/requests/request-1/offers/offer-1'],
      ['PATCH', '/api/v1/requests/request-1/offers/offer-1/accept'],
    ]) {
      expect(publicMutationCacheTags(method, path)).toContain('route:requests');
    }
  });

  it('invalidates service listings when a provider changes', () => {
    expect(publicMutationCacheTags('PUT', '/api/v1/service-providers/provider-7')).toContain('route:service-listings');
  });

  it('does not turn reserved route segments into entity identifiers', () => {
    expect(publicMutationCacheTags('POST', '/api/v1/ads/search')).toEqual([
      'route:ads', 'route:home', 'route:search',
    ]);
  });


  it('invalidates public catalogs for admin moderation writes', () => {
    expect(publicMutationCacheTags('PATCH', '/api/v1/admin/ads/ad_7/featured')).toEqual([
      'route:ads', 'route:home', 'route:search', 'ad:ad_7',
    ]);
    expect(publicMutationCacheTags('PATCH', '/api/v1/admin/products/product_7/status')).toEqual([
      'route:products', 'route:collections', 'route:home', 'route:search', 'product:product_7',
    ]);
    expect(publicMutationCacheTags('PATCH', '/api/v1/admin/service-listings/service_7/status')).toContain('service:service_7');
    expect(publicMutationCacheTags('PATCH', '/api/v1/admin/fraud/ads/ad_9/clear')).toContain('route:ads');
  });

  it('does not invalidate public cache for personal engagement or store-member operations', () => {
    expect(publicMutationCacheTags('POST', '/api/v1/stores/store_1/follow')).toEqual([]);
    expect(publicMutationCacheTags('POST', '/api/v1/stores/me/member-invites')).toEqual([]);
    expect(publicMutationCacheTags('POST', '/api/v1/ads/ad_1/favorite')).toEqual([]);
  });

  it('still invalidates store profile and public review changes', () => {
    expect(publicMutationCacheTags('PATCH', '/api/v1/stores/me')).toContain('route:stores');
    const storeReviewTags = publicMutationCacheTags('POST', '/api/v1/stores/store_1/reviews');
    expect(storeReviewTags).toContain('route:stores');
    expect(storeReviewTags).toContain('route:badges');
    expect(storeReviewTags).toContain('route:public');
  });

  it('invalidates public collections when products, promotions, or collection membership change', () => {
    expect(publicMutationCacheTags('PATCH', '/api/v1/products/product_1')).toContain('route:collections');
    expect(publicMutationCacheTags('PATCH', '/api/v1/products/product_1')).toContain('route:search');
    expect(publicMutationCacheTags('POST', '/api/v1/collections')).toContain('route:collections');
    expect(publicMutationCacheTags('POST', '/api/v1/collections/collection_1/products/product_1')).toContain('route:collections');
    expect(publicMutationCacheTags('PATCH', '/api/v1/promotions/promotion_1')).toContain('route:collections');
  });

  it('invalidates public badges and store sales stats for relevant writes', () => {
    const sellerRatingTags = publicMutationCacheTags('POST', '/api/v1/sellers/seller_1/ratings');
    expect(sellerRatingTags).toContain('route:badges');
    expect(sellerRatingTags).toContain('seller:seller_1');
    expect(publicMutationCacheTags('POST', '/api/v1/service-reviews')).toContain('route:badges');
    expect(publicMutationCacheTags('POST', '/api/v1/sales')).toEqual(['route:public']);
    expect(publicMutationCacheTags('PATCH', '/api/v1/categories/cat-1')).toContain('route:search');
    expect(publicMutationCacheTags('PATCH', '/api/v1/store-types/st-1')).toContain('route:search');
  });

  it('ignores malformed and non-API paths', () => {
    expect(publicMutationCacheTags('DELETE', 'https://other.example/api/v1/ads/1')).toEqual([]);
    expect(publicMutationCacheTags('DELETE', '/api/v2/ads/1')).toEqual([]);
  });
});
