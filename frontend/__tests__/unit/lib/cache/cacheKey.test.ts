import { describe, expect, it } from 'vitest';
import { canonicalCacheKey, canonicalUrlIdentity, canonicalGenerationKey } from '@/lib/cache/cacheKey';

describe('canonical cache identity', () => {
  it('is stable when object key order changes', () => {
    expect(canonicalCacheKey('products-list', 'public', { page: 1, limit: 20 }))
      .toBe(canonicalCacheKey('products-list', 'public', { limit: 20, page: 1 }));
  });

  it('normalizes API version and query ordering', () => {
    expect(canonicalUrlIdentity('/api/v1/products?limit=20&page=1'))
      .toBe('/products?limit=20&page=1');
    expect(canonicalUrlIdentity('/api/v2/products?page=1&limit=20'))
      .toBe('/products?limit=20&page=1');
  });

  it('keeps scope as part of identity', () => {
    expect(canonicalCacheKey('profile', 'personal', { id: '1' }))
      .not.toBe(canonicalCacheKey('profile', 'private', { id: '1' }));
  });
});


describe('canonical generation identity', () => {
  it('separates hard and soft generation tokens', () => {
    expect(canonicalGenerationKey('products-list', 'public', 'hard'))
      .not.toBe(canonicalGenerationKey('products-list', 'public', 'soft'));
  });
});
