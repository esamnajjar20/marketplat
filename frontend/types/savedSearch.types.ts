import type { AdCondition } from './ad.types';

/** PLATFORM-WIDE-01: which entity kind this saved search matches
 * against. Optional/defaults to 'ads' on read for rows saved before
 * this field existed — mirrors the backend schema's own default, see
 * saved-searches.validation.ts's savedSearchTypeSchema. */
export type SavedSearchType = 'ads' | 'products' | 'services';

/** Mirrors backend saved-searches.validation.ts's savedSearchFiltersSchema.
 * Every key optional and unconstrained-if-absent, same semantics as
 * GET /ads's query params. `city`/`condition` are only ever meaningful
 * for type 'ads' — see that schema's own comment for why. */
export interface SavedSearchFilters {
  type?: SavedSearchType;
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
