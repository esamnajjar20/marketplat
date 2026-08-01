import type { AdCondition } from './ad.types';

/** Mirrors backend saved-searches.validation.ts's savedSearchFiltersSchema.
 * Every key optional and unconstrained-if-absent, same semantics as
 * GET /ads's query params. */
export interface SavedSearchFilters {
  q?: string;
  city?: string;
  categoryId?: string;
  condition?: AdCondition;
  minPrice?: number;
  maxPrice?: number;
}

export interface SavedSearch {
  id: string;
  userId: string;
  label: string;
  filters: SavedSearchFilters;
  createdAt: string;
  lastNotifiedAt: string | null;
}

export interface CreateSavedSearchInput {
  label: string;
  filters: SavedSearchFilters;
}
