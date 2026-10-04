/**
 * Shared types for the unified search module.
 *
 * Design note: Ad / Product / StoreDetails / ServiceListing each have
 * their own column shapes (see search.repository.ts's header comment
 * for the full breakdown of what each entity does/doesn't have — e.g.
 * StoreDetails has no `views`, Product has no own `city`). SearchResult
 * below is the normalized shape every entity gets mapped into so the
 * frontend never needs to branch on `type` to know which field to read.
 */
import { PaginationMeta } from '../../shared/utils/pagination';

export const SEARCH_TYPES = ['all', 'ads', 'products', 'stores', 'services'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Singular discriminant on each normalized result row. */
export type SearchResultType = 'ad' | 'product' | 'store' | 'service';

// TRACK-NEARBY-SEARCH: 'distance' is only a valid sort choice when
// lat/lng are present on the request — search.validation.ts's
// searchQuerySchema enforces that with a .refine(), the same "sort
// value requires certain other params" shape ads.validation.ts's own
// adsQuerySchema already uses for minPrice/maxPrice ordering.
export const SEARCH_SORT_OPTIONS = ['relevance', 'rating', 'newest', 'views', 'price_asc', 'price_desc', 'distance'] as const;
export type SearchSort = (typeof SEARCH_SORT_OPTIONS)[number];

export interface SearchResultSeller {
  id: string;
  name: string;
  verified: boolean;
  /**
   * FIX M-023: `id` above resolves to a DIFFERENT kind of entity
   * depending on the result's `type` — search.repository.ts's adBranch
   * uses coalesce(sellerProfile.id, user.id), while productBranch uses
   * store.id (a completely different entity). Frontend code that reads
   * seller.id assuming it always means the same thing (e.g. to build a
   * "view seller" link) would silently construct the wrong URL/behavior
   * depending on result type, with nothing in the response shape itself
   * flagging that distinction. This field makes the actual entity kind
   * explicit per-row instead of leaving it as tribal knowledge —
   * 'seller_profile' for ads (or 'user' in the rare case an ad's
   * seller has no SellerProfile yet — see the coalesce above),
   * 'store' for products/stores, 'service_provider' for services.
   */
  type: 'seller_profile' | 'user' | 'store' | 'service_provider';
}

export interface SearchResult {
  id: string;
  type: SearchResultType;
  title: string;
  description: string;
  /** First image / logo, or null if the entity has none set. */
  image: string | null;
  city: string | null;
  /** Parsed from SellerProfile.averageRating (Decimal → number), 0 if the entity has no ratings yet. */
  rating: number;
  /** 0 for stores — StoreDetails has no views column. */
  views: number;
  price: string | null;
  seller: SearchResultSeller;
  /** Frontend-ready path — see search.repository.ts's ENTITY_URL_PREFIX. */
  url: string;
  createdAt: string;
  /**
   * TRACK-NEARBY-SEARCH: present only when the request carried lat/lng
   * (search.validation.ts's searchQuerySchema) — null for every result
   * on a plain (non-geo) search, and null per-row for stores/services
   * a geo search couldn't resolve a distance for (e.g. a service whose
   * provider has no lat/lng pin, only serviceAreaCities). Never a
   * mandatory field to read; UnifiedResultCard/SearchResults only
   * render it when non-null.
   */
  /** Opt-in map pin — null when the entity has no coordinates. */
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
}

export interface UnifiedSearchResponse {
  results: SearchResult[];
  // Reuses shared/utils/pagination.ts's PaginationMeta (same shape
  // every other module's buildPaginationMeta() produces) rather than a
  // module-local type — the frontend's unwrapPaginated() /
  // PaginationMeta type assumes this exact shape (including
  // hasNextPage/hasPrevPage) for every list endpoint, this one
  // included.
  pagination: PaginationMeta;
}

/** Raw row shape returned by every branch of the UNION ALL in search.repository.ts, before normalization. */
export interface RawSearchRow {
  id: string;
  type: SearchResultType;
  title: string;
  description: string;
  image: string | null;
  city: string | null;
  rating: number;
  views: number;
  price: string | null;
  seller_id: string;
  seller_name: string;
  seller_verified: boolean;
  // FIX M-023: see SearchResultSeller.type's own comment — carries
  // the actual entity kind seller_id refers to for this row, since it
  // differs by branch (ads vs. products/stores vs. services).
  seller_type: 'seller_profile' | 'user' | 'store' | 'service_provider';
  url_id: string;
  created_at: Date;
  rank: number;
  /** TRACK-NEARBY-SEARCH: see SearchResult.distanceKm's own comment — null when the request had no lat/lng, or the entity/row couldn't resolve one. */
  distance_km: number | null;
  latitude: number | null;
  longitude: number | null;
}
