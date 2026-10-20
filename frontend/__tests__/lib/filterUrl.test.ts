/**
 * Unit tests for filter URL helpers.
 * Place under: frontend/__tests__/lib/filterUrl.test.ts
 * Run: npx vitest run __tests__/lib/filterUrl.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  parseSearchParams,
  stateToSearchParams,
  countActiveFilters,
  buildSearchHref,
} from '@/lib/filterUrl';

describe('parseSearchParams', () => {
  it('parses empty params to defaults', () => {
    const s = parseSearchParams(new URLSearchParams());
    expect(s.type).toBe('all');
    expect(s.city).toBeUndefined();
    expect(s.lat).toBeUndefined();
  });

  it('parses full filter set', () => {
    const sp = new URLSearchParams({
      q: 'هاتف',
      type: 'ads',
      city: 'غزة',
      minPrice: '50',
      maxPrice: '200',
      condition: 'USED',
      sort: 'price_asc',
      lat: '31.5',
      lng: '34.5',
      radius: '15',
    });
    const s = parseSearchParams(sp);
    expect(s.q).toBe('هاتف');
    expect(s.type).toBe('ads');
    expect(s.city).toBe('غزة');
    expect(s.minPrice).toBe(50);
    expect(s.maxPrice).toBe(200);
    expect(s.condition).toBe('USED');
    expect(s.sort).toBe('price_asc');
    expect(s.lat).toBe(31.5);
    expect(s.lng).toBe(34.5);
    expect(s.radius).toBe(15);
  });

  it('ignores invalid condition', () => {
    const s = parseSearchParams(new URLSearchParams({ condition: 'BROKEN' }));
    expect(s.condition).toBeUndefined();
  });
});

describe('stateToSearchParams', () => {
  it('omits defaults (type=all, sort=relevance)', () => {
    const params = stateToSearchParams({ type: 'all', sort: 'relevance', city: 'رفح' });
    expect(params.get('type')).toBeNull();
    expect(params.get('sort')).toBeNull();
    expect(params.get('city')).toBe('رفح');
  });

  it('writes nearby trio together', () => {
    const params = stateToSearchParams({ lat: 31.5, lng: 34.4 });
    expect(params.get('lat')).toBe('31.5');
    expect(params.get('lng')).toBe('34.4');
    expect(params.get('radius')).toBe('10'); // DEFAULT_RADIUS_KM
  });
});

describe('countActiveFilters', () => {
  it('counts each active key once', () => {
    expect(countActiveFilters({})).toBe(0);
    expect(
      countActiveFilters({
        city: 'غزة',
        minPrice: 10,
        maxPrice: 100,
        condition: 'NEW',
        sort: 'newest',
        lat: 1,
        lng: 2,
      }),
    ).toBe(6);
  });

  it('does not count relevance sort', () => {
    expect(countActiveFilters({ sort: 'relevance' })).toBe(0);
  });
});

describe('buildSearchHref', () => {
  it('patches city and resets page', () => {
    const current = new URLSearchParams({ city: 'غزة', page: '3', q: 'x' });
    const href = buildSearchHref(current, { city: 'رفح' });
    expect(href).toContain('city=%D8%B1%D9%81%D8%AD'); // رفح encoded
    expect(href).toContain('q=x');
    expect(href).not.toContain('page=');
  });

  it('clears nearby and distance sort', () => {
    const current = new URLSearchParams({
      lat: '31',
      lng: '34',
      radius: '10',
      sort: 'distance',
    });
    const href = buildSearchHref(current, {
      clearKeys: ['lat', 'lng', 'radius'],
      lat: undefined,
    });
    expect(href).not.toContain('lat=');
    expect(href).not.toContain('sort=distance');
  });
});
