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
/** TRACK-NEARBY-SEARCH: 'distance' only valid alongside lat/lng — see SearchQuery's own comment. */
export type SearchSort = 'relevance' | 'rating' | 'newest' | 'views' | 'price_asc' | 'price_desc' | 'distance';

export interface SearchResultSeller {
  id: string;
  name: string;
  verified: boolean;
  /**
   * COMPAT-AUDIT fix: backend's search.service.ts (FIX M-023) always
   * sends this — `id` above resolves to a different kind of entity
   * depending on the result's `type` (adBranch uses the ad's
   * SellerProfile/User id, productBranch/storeBranch use the store's
   * id, serviceBranch uses the provider's id), so this field makes the
   * actual entity `id` refers to explicit per-row rather than leaving
   * it as tribal knowledge. Not yet read anywhere in the frontend
   * (UnifiedResultCard only uses seller.name/verified today) — added
   * so the type reflects the real API contract before any future code
   * builds a "view seller" link off seller.id without realizing it
   * means something different per result type.
   */
  type: 'seller_profile' | 'user' | 'store' | 'service_provider';
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
  /**
   * TRACK-NEARBY-SEARCH: present only when the request carried lat/lng —
   * null on a plain search, and null per-row for any result whose
   * entity has no lat/lng pin even inside a geo search (e.g. a store
   * that never set one). Never assume non-null; only render distance
   * UI when it's actually there.
   */
  distanceKm: number | null;
  latitude: number | null;
  longitude: number | null;
}

/** GET /search query params. */
export interface SearchQuery {
  q?: string;
  city?: string;
  type?: SearchType;
  categoryId?: string;
  minPrice?: number;
  maxPrice?: number;
  condition?: 'NEW' | 'USED' | 'REFURBISHED';
  sort?: SearchSort;
  page?: number;
  limit?: number;
  /**
   * TRACK-NEARBY-SEARCH: optional — must be provided together (backend
   * rejects one without the other), same pairing
   * NearbyServiceProvidersParams already requires. Enables a
   * `distanceKm` on every result and unlocks `sort: 'distance'`.
   */
  lat?: number;
  lng?: number;
  /** km, server default 10, capped 100 — same bounds as service-providers' own radius. */
  radius?: number;
}

/** GET /search/suggestions query params. */
export interface SearchSuggestionsQuery {
  q: string;
}
