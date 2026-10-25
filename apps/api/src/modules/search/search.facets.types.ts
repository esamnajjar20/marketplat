/**
 * Facet types for GET /search/facets
 *
 * Paste / merge into apps/api/src/modules/search/search.types.ts
 * (or keep as a sibling file and re-export from index).
 *
 * Design:
 *  - Facets are computed with the SAME base filters as the main search
 *    (q, type, city, categoryId, price, condition, lat/lng) EXCEPT the
 *    dimension being faceted is left unconstrained so counts stay useful
 *    (classic "disjunctive facets" pattern).
 *  - Lightweight endpoint — no result rows, only aggregation counts.
 *  - Cacheable SHORT (30s) like GET /search.
 */

export interface FacetBucket {
  /** Value used as query param (city name, categoryId, condition enum, …). */
  value: string;
  /** Display label (Arabic when available). */
  label: string;
  count: number;
}

export interface SearchFacetsResponse {
  cities: FacetBucket[];
  categories: FacetBucket[];
  conditions: FacetBucket[];
  /** Coarse price ranges matching frontend PRICE_PRESETS. */
  priceRanges: FacetBucket[];
  /** Total matching the current filter set (same as pagination.total would). */
  total: number;
}
