import { describe, expect, it } from 'vitest';
import {
  buildFilterParams,
  buildFilterHref,
  clearFilterParams,
  countConfiguredFilters,
  updateFilterParams,
  FILTER_PROFILES,
  getFilterProfile,
  normalizeFilterPage,
  parseFilterEnum,
} from '../../../shared/filters';

describe('shared filter core', () => {
  it('serializes values consistently and omits empty values', () => {
    const params = buildFilterParams({ search: '  هاتف  ', city: '', minPrice: 0, maxPrice: Number.NaN, promoted: false });
    expect(params.get('search')).toBe('هاتف');
    expect(params.get('city')).toBeNull();
    expect(params.get('minPrice')).toBe('0');
    expect(params.get('maxPrice')).toBeNull();
    expect(params.get('promoted')).toBe('false');
  });

  it('restricts API serialization to the selected page contract', () => {
    const stores = buildFilterParams(
      { search: 'محل', city: 'نابلس', type: 'GROCERY', minPrice: 10, page: 2, limit: 20, unexpected: 'ignored' },
      { profile: 'storesBrowse' },
    );
    expect(stores.get('search')).toBe('محل');
    expect(stores.get('city')).toBe('نابلس');
    expect(stores.get('type')).toBe('GROCERY');
    expect(stores.get('page')).toBe('2');
    expect(stores.get('limit')).toBe('20');
    expect(stores.has('minPrice')).toBe(false);
    expect(stores.has('unexpected')).toBe(false);

    const products = buildFilterParams(
      { storeId: 'store-1', availability: 'IN_STOCK', hasPromotion: true, status: 'DRAFT' },
      { profile: 'productsBrowse' },
    );
    expect(products.get('storeId')).toBe('store-1');
    expect(products.get('availability')).toBe('IN_STOCK');
    expect(products.get('hasPromotion')).toBe('true');
    expect(products.has('status')).toBe(false);
  });

  it('updates filters atomically, preserves unrelated state and resets page', () => {
    const next = updateFilterParams('tab=products&page=5&city=غزة&status=ACTIVE', { city: 'رفح', minPrice: 25 }, { clearKeys: ['status'] });
    expect(next.get('tab')).toBe('products');
    expect(next.get('city')).toBe('رفح');
    expect(next.get('minPrice')).toBe('25');
    expect(next.has('status')).toBe(false);
    expect(next.has('page')).toBe(false);
  });

  it('clears filters while retaining only configured context keys', () => {
    const next = clearFilterParams('q=phone&type=ads&city=غزة&page=3&sort=price', ['q', 'type']);
    expect(next.toString()).toBe('q=phone&type=ads');
  });

  it('rejects unknown UI keys while allowing configured context-only keys', () => {
    const next = updateFilterParams(
      'q=phone&focus=city&city=غزة&page=4',
      { city: 'نابلس', focus: 'search', debug: '1' },
      { allowedKeys: [...getFilterProfile('globalSearch').keys, ...(getFilterProfile('globalSearch').params ?? []), ...(getFilterProfile('globalSearch').contextKeys ?? []), 'page', 'limit'] },
    );
    expect(next.get('city')).toBe('نابلس');
    expect(next.get('focus')).toBe('search');
    expect(next.has('debug')).toBe(false);
    expect(next.has('page')).toBe(false);

    const api = buildFilterParams({ q: 'phone', focus: 'search', city: 'نابلس' }, { profile: 'globalSearch' });
    expect(api.get('q')).toBe('phone');
    expect(api.get('city')).toBe('نابلس');
    expect(api.has('focus')).toBe(false);
  });

  it('counts grouped filters once and ignores defaults', () => {
    const params = new URLSearchParams('city=غزة&lat=31&lng=34&sort=relevance&condition=USED');
    expect(countConfiguredFilters(params, {
      keys: ['city', 'lat', 'lng', 'sort', 'condition'],
      groups: [['lat', 'lng']],
      ignoredValues: { sort: ['relevance'] },
    })).toBe(3);
  });

  it('builds a path without an empty query marker', () => {
    expect(buildFilterHref('/stores', new URLSearchParams())).toBe('/stores');
  });

  it('exposes one canonical profile for each supported filter surface', () => {
    expect(Object.keys(FILTER_PROFILES)).toEqual(expect.arrayContaining([
      'adsBrowse', 'adsCategoryBrowse', 'productsBrowse', 'servicesBrowse',
      'storesBrowse', 'globalSearch', 'openRequests', 'myAds', 'myProducts',
      'myServices', 'myServiceRequests', 'incomingServiceRequests',
      'myOpenRequests', 'myRequestOffers', 'favorites', 'storeInventory',
      'storeProducts', 'appointments', 'adminAds', 'adminUsers', 'adminStores',
      'adminReports', 'adminAuditLogs', 'adminSellers', 'adminProducts',
      'adminServiceListings', 'adminOpenRequests', 'serviceProviders', 'providerServices',
      'customers', 'activity', 'salesCostProducts', 'salesBrowse', 'salesReports',
      'marketplaceOrders', 'conversations', 'notifications', 'promotions', 'salesDebts', 'salesSummary',
    ]));

    for (const profile of Object.values(FILTER_PROFILES)) {
      expect(new Set(profile.keys).size).toBe(profile.keys.length);
      for (const group of profile.groups ?? []) {
        expect(group.length).toBeGreaterThan(1);
        for (const key of group) expect(profile.keys).toContain(key);
      }
    }

    expect(getFilterProfile('productsBrowse').keys).toContain('availability');
    expect(getFilterProfile('storesBrowse').keys).toContain('type');
  });

  it('normalizes pagination and rejects invalid enum values from URLs', () => {
    expect(normalizeFilterPage('3')).toBe(3);
    expect(normalizeFilterPage('0')).toBe(1);
    expect(normalizeFilterPage('-4')).toBe(1);
    expect(normalizeFilterPage('2.5')).toBe(1);
    expect(normalizeFilterPage('999999', 1, 500)).toBe(500);
    expect(parseFilterEnum('USED', ['NEW', 'USED'] as const)).toBe('USED');
    expect(parseFilterEnum('ADMIN', ['NEW', 'USED'] as const)).toBeUndefined();
  });

  it('counts profile defaults consistently across pages', () => {
    const ads = new URLSearchParams('city=غزة&sortBy=createdAt&sortOrder=desc&minPrice=10');
    expect(countConfiguredFilters(ads, getFilterProfile('adsBrowse'))).toBe(2);

    const search = new URLSearchParams('sort=relevance&lat=31.9&lng=34.4&condition=USED');
    expect(countConfiguredFilters(search, getFilterProfile('globalSearch'))).toBe(2);
  });

});
