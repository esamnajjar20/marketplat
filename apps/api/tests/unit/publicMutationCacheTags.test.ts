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
      'route:products', 'route:home', 'product:product_123',
    ]);
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
      'route:products', 'route:home', 'product:product_7',
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
    expect(publicMutationCacheTags('POST', '/api/v1/stores/store_1/reviews')).toContain('route:stores');
  });

  it('ignores malformed and non-API paths', () => {
    expect(publicMutationCacheTags('DELETE', 'https://other.example/api/v1/ads/1')).toEqual([]);
    expect(publicMutationCacheTags('DELETE', '/api/v2/ads/1')).toEqual([]);
  });
});
