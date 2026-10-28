/**
 * Shared helpers to convert SearchFilterState ↔ URLSearchParams.
 * Used by the store, desktop sidebar, QuickFilters, and ActiveFilters.
 */

import type { SearchFilterState } from '@/types/filter.types';
import type { SearchSort, SearchType } from '@/types/search.types';
import type { AdCondition } from '@/types/filter.types';
import { ROUTES } from '@/lib/constants';

export function parseSearchParams(sp: URLSearchParams): SearchFilterState {
  const type = sp.get('type') as SearchType | null;
  const sort = sp.get('sort') as SearchSort | null;
  const condition = sp.get('condition') as AdCondition | null;
  const minPrice = sp.get('minPrice');
  const maxPrice = sp.get('maxPrice');
  const lat = sp.get('lat');
  const lng = sp.get('lng');
  const radius = sp.get('radius');
  const page = sp.get('page');

  return {
    q: sp.get('q') ?? undefined,
    type:
      type && ['all', 'ads', 'products', 'stores', 'services'].includes(type)
        ? type
        : 'all',
    city: sp.get('city') ?? undefined,
    categoryId: sp.get('categoryId') ?? undefined,
    minPrice: minPrice != null && minPrice !== '' ? Number(minPrice) : undefined,
    maxPrice: maxPrice != null && maxPrice !== '' ? Number(maxPrice) : undefined,
    condition:
      condition && ['NEW', 'USED', 'REFURBISHED'].includes(condition)
        ? condition
        : undefined,
    sort: sort ?? undefined,
    lat: lat != null && lat !== '' ? Number(lat) : undefined,
    lng: lng != null && lng !== '' ? Number(lng) : undefined,
    radius: radius != null && radius !== '' ? Number(radius) : undefined,
    page: page != null && page !== '' ? Number(page) : undefined,
  };
}

export function stateToSearchParams(state: SearchFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  if (state.type && state.type !== 'all') params.set('type', state.type);
  if (state.city) params.set('city', state.city);
  if (state.categoryId) params.set('categoryId', state.categoryId);
  if (state.minPrice != null && !Number.isNaN(state.minPrice)) {
    params.set('minPrice', String(state.minPrice));
  }
  if (state.maxPrice != null && !Number.isNaN(state.maxPrice)) {
    params.set('maxPrice', String(state.maxPrice));
  }
  if (state.condition) params.set('condition', state.condition);
  if (state.sort && state.sort !== 'relevance') params.set('sort', state.sort);
  // GPS-free: never serialize lat/lng/radius into the URL from the UI layer
  return params;
}

/** Build the full search path from a partial patch applied on top of current params. */
export function buildSearchHref(
  current: URLSearchParams,
  patch: Partial<SearchFilterState> & { clearKeys?: string[] },
): string {
  const state = parseSearchParams(current);
  const next: SearchFilterState = { ...state, ...patch, page: undefined };

  if (patch.clearKeys) {
    for (const key of patch.clearKeys) {
      delete next[key as keyof SearchFilterState];
    }
  }

  // Clearing nearby must also drop distance sort
  if (patch.lat === undefined && patch.clearKeys?.includes('lat')) {
    delete next.lat;
    delete next.lng;
    delete next.radius;
    if (next.sort === 'distance') delete next.sort;
  }

  const params = stateToSearchParams(next);
  const q = params.toString();
  return q ? `${ROUTES.search}?${q}` : ROUTES.search;
}

/** Count active filters for badge (excludes q, type, page). */
export function countActiveFilters(state: SearchFilterState): number {
  let n = 0;
  if (state.city) n += 1;
  if (state.categoryId) n += 1;
  if (state.minPrice != null) n += 1;
  if (state.maxPrice != null) n += 1;
  if (state.condition) n += 1;
  if (state.sort && state.sort !== 'relevance') n += 1;
  // GPS-free product: lat/lng do not count toward active filter badge
  return n;
}
