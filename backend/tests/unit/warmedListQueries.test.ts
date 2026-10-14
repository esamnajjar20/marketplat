import {
  WARMED_LIST_HARD_TTL_SECONDS,
  WARMED_ADS_DEFAULT_QUERY,
  WARMED_ADS_FEATURED_QUERY,
  WARMED_PRODUCTS_DEFAULT_QUERY,
  WARMED_PRODUCTS_HOME_QUERY,
  WARMED_STORES_DEFAULT_QUERY,
  WARMED_STORES_HOME_QUERY,
  WARMED_SERVICE_LISTINGS_DEFAULT_QUERY,
  WARMED_SERVICE_PROVIDERS_DEFAULT_QUERY,
  isWarmedListQuery,
  listHardTtlSec,
} from '../../src/shared/cache/warmedListQueries';
import { cachePolicy } from '../../src/shared/cache/cachePolicy';

// Same value as KEEP_WARM_INTERVAL_MS in cacheWarmup.ts (not imported: that module pulls in every service).
const KEEP_WARM_INTERVAL_MS = 4 * 60_000;
const PUBLIC_LIST_HARD_TTL_SECONDS = cachePolicy('publicLive').server.hardTtlSec;

describe('warmed list hard TTL (FIX WARM-LIST-HARD-TTL-01)', () => {
  it('the policy hard TTL alone cannot survive a keep-warm cycle (the bug this fixes)', () => {
    expect(PUBLIC_LIST_HARD_TTL_SECONDS * 1000).toBeLessThan(KEEP_WARM_INTERVAL_MS);
  });

  it('the warmed hard TTL leaves a full keep-warm interval of headroom', () => {
    expect(WARMED_LIST_HARD_TTL_SECONDS * 1000).toBeGreaterThan(KEEP_WARM_INTERVAL_MS * 2);
  });

  it.each([
    ['ads', WARMED_ADS_DEFAULT_QUERY],
    ['ads', WARMED_ADS_FEATURED_QUERY],
    ['products', WARMED_PRODUCTS_DEFAULT_QUERY],
    ['products', WARMED_PRODUCTS_HOME_QUERY],
    ['stores', WARMED_STORES_DEFAULT_QUERY],
    ['stores', WARMED_STORES_HOME_QUERY],
    ['service-listings', WARMED_SERVICE_LISTINGS_DEFAULT_QUERY],
    ['service-providers', WARMED_SERVICE_PROVIDERS_DEFAULT_QUERY],
  ] as const)('%s: the warmed shape gets the long hard TTL', (scope, query) => {
    expect(isWarmedListQuery(scope, query)).toBe(true);
    expect(listHardTtlSec(scope, query, PUBLIC_LIST_HARD_TTL_SECONDS)).toBe(WARMED_LIST_HARD_TTL_SECONDS);
  });

  it('key order and undefined fields do not change the shape identity', () => {
    expect(isWarmedListQuery('products', { sortOrder: 'desc', limit: 8, sortBy: 'createdAt', q: undefined })).toBe(true);
  });

  it('filtered, searched, deep-paged or other-scope queries keep the short policy TTL', () => {
    expect(listHardTtlSec('products', { ...WARMED_PRODUCTS_DEFAULT_QUERY, q: 'phone' }, 90)).toBe(90);
    expect(listHardTtlSec('products', { ...WARMED_PRODUCTS_DEFAULT_QUERY, page: 2 }, 90)).toBe(90);
    expect(listHardTtlSec('ads', { page: 1 }, 90)).toBe(90);
    // an ads shape is not a stores shape
    expect(listHardTtlSec('stores', WARMED_ADS_FEATURED_QUERY, 90)).toBe(90);
  });

  it('never lowers a TTL that is already longer', () => {
    expect(listHardTtlSec('ads', WARMED_ADS_DEFAULT_QUERY, 900)).toBe(900);
  });
});
