/**
 * Unified search types — maps to backend's search module
 * (search.types.ts / search.validation.ts). Verified directly against
 * search.controller.ts / search.repository.ts:
 *
 *   - SearchResult is entity-agnostic on purpose — the backend
 *     normalizes Ad/Product/StoreDetails/ServiceListing into this one
 *     shape (see search.service.ts's normalizeRow), so this file never
 *     needs to branch per-entity the way ad.types.ts / product.types.ts
 *     / store.types.ts / service.types.ts do individually.
 *   - GET /search's response follows the same { data: T[], meta:
 *     { pagination } } shape as every other paginated list endpoint
 *     (ads.getAll, products.getAll, etc.) — unwrapPaginated() applies
 *     here unchanged.
 *   - GET /search/suggestions is NOT paginated — a bare
 *     { suggestions: string[] } payload under `data`, same
 *     "small non-list payload" convention as ToggleStoreFollowResult.
 */

export type SearchType = 'all' | 'ads' | 'products' | 'stores' | 'services';
export type SearchResultType = 'ad' | 'product' | 'store' | 'service';
export type SearchSort = 'relevance' | 'rating' | 'newest' | 'views';

export interface SearchResultSeller {
  id: string;
  name: string;
  verified: boolean;
}

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  description: string;
  image: string | null;
  city: string | null;
  rating: number;
  views: number;
  /** Decimal → string over the wire, same convention as Ad.price/Product.price, or null (stores have no price). */
  price: string | null;
  seller: SearchResultSeller;
  /** Frontend-ready path (e.g. `/ads/{id}`, `/stores/{id}`) — navigate directly, no per-type branching needed. */
  url: string;
  createdAt: string;
}

/** GET /search query params. */
export interface SearchQuery {
  q?: string;
  city?: string;
  type?: SearchType;
  categoryId?: string;
  sort?: SearchSort;
  page?: number;
  limit?: number;
}

/** GET /search/suggestions query params. */
export interface SearchSuggestionsQuery {
  q: string;
}
