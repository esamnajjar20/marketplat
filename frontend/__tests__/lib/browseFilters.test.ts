import { describe, expect, it } from 'vitest';
import {
  buildBrowseFilterHref,
  countActiveFilterParams,
  updateBrowseFilterParams,
} from '@/lib/browseFilters';

describe('browse filter URL helpers', () => {
  it('updates and removes params while preserving unrelated filters and clearing pagination', () => {
    const params = updateBrowseFilterParams(
      'city=غزة&page=4&condition=NEW',
      { city: 'النصيرات', minPrice: 50, condition: '' },
    );

    expect(params.get('city')).toBe('النصيرات');
    expect(params.get('minPrice')).toBe('50');
    expect(params.has('condition')).toBe(false);
    expect(params.has('page')).toBe(false);
  });

  it('clears dependent filters atomically when the service type changes', () => {
    const params = updateBrowseFilterParams(
      'serviceTypeId=old&categoryId=cat-1&attributeFilters=%7B%22a%22%3A1%7D&serviceLocation=REMOTE&page=3',
      { serviceTypeId: 'new' },
      ['categoryId', 'attributeFilters', 'serviceLocation'],
    );

    expect(params.get('serviceTypeId')).toBe('new');
    expect(params.has('categoryId')).toBe(false);
    expect(params.has('attributeFilters')).toBe(false);
    expect(params.has('serviceLocation')).toBe(false);
    expect(params.has('page')).toBe(false);
  });

  it('builds a clean path when no filters remain', () => {
    expect(buildBrowseFilterHref('/products', new URLSearchParams())).toBe('/products');
  });

  it('counts paired geo params as one active filter', () => {
    const params = new URLSearchParams('city=غزة&lat=31.9&lng=35.2&page=2');
    expect(countActiveFilterParams(params, ['city'], [['lat', 'lng']])).toBe(2);
  });

  it('does not count empty params or pagination', () => {
    const params = new URLSearchParams('city=&minPrice=0&page=2');
    expect(countActiveFilterParams(params, ['city', 'minPrice', 'page'])).toBe(1);
  });
});
