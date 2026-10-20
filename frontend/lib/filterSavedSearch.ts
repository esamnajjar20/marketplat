/**
 * Convert between SearchFilterState (URL/native filters) and SavedSearchFilters
 * (backend saved-searches module).
 *
 * Place at: frontend/lib/filterSavedSearch.ts
 */

import type { SearchFilterState } from '@/types/filter.types';
import type { SavedSearchFilters, SavedSearchType } from '@/types/savedSearch.types';
import type { SearchType } from '@/types/search.types';
import { stateToSearchParams } from '@/lib/filterUrl';
import { ROUTES } from '@/lib/constants';

/** Map unified search type → saved-search type (stores not supported server-side). */
export function toSavedSearchType(type?: SearchType): SavedSearchType {
  if (type === 'products') return 'products';
  if (type === 'services') return 'services';
  return 'ads';
}

/** Draft/URL filter state → payload for POST /saved-searches */
export function filterStateToSavedFilters(
  state: SearchFilterState,
): SavedSearchFilters {
  const filters: SavedSearchFilters = {
    type: toSavedSearchType(state.type),
  };
  if (state.q?.trim()) filters.q = state.q.trim();
  if (state.city) filters.city = state.city;
  if (state.categoryId) filters.categoryId = state.categoryId;
  if (state.condition) filters.condition = state.condition;
  if (state.minPrice != null) filters.minPrice = state.minPrice;
  if (state.maxPrice != null) filters.maxPrice = state.maxPrice;
  return filters;
}

/** Saved filters → URL href on the unified search page */
export function savedFiltersToSearchHref(filters: SavedSearchFilters): string {
  const state: SearchFilterState = {
    q: filters.q,
    type:
      filters.type === 'products'
        ? 'products'
        : filters.type === 'services'
          ? 'services'
          : 'ads',
    city: filters.city,
    categoryId: filters.categoryId,
    condition: filters.condition,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
  };
  const params = stateToSearchParams(state);
  const q = params.toString();
  return q ? `${ROUTES.search}?${q}` : ROUTES.search;
}

/** True if there is at least one criterion worth saving (mirrors backend refine). */
export function hasSavableCriteria(state: SearchFilterState): boolean {
  return Boolean(
    state.q?.trim() ||
      state.city ||
      state.categoryId ||
      state.condition ||
      state.minPrice != null ||
      state.maxPrice != null,
  );
}

/** Auto label from active filters (Arabic). */
export function suggestSavedSearchLabel(state: SearchFilterState): string {
  const parts: string[] = [];
  if (state.q?.trim()) parts.push(`«${state.q.trim()}»`);
  if (state.city) parts.push(state.city);
  if (state.condition) {
    const map: Record<string, string> = {
      NEW: 'جديد',
      USED: 'مستعمل',
      REFURBISHED: 'مجدد',
    };
    parts.push(map[state.condition] ?? state.condition);
  }
  if (state.minPrice != null || state.maxPrice != null) {
    const min = state.minPrice != null ? String(state.minPrice) : '0';
    const max = state.maxPrice != null ? String(state.maxPrice) : '∞';
    parts.push(`${min}–${max} ₪`);
  }
  if (!parts.length) return 'بحث محفوظ';
  return parts.slice(0, 3).join(' · ');
}
