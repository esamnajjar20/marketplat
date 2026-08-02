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

export const SEARCH_SORT_OPTIONS = ['relevance', 'rating', 'newest', 'views'] as const;
export type SearchSort = (typeof SEARCH_SORT_OPTIONS)[number];

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
  url_id: string;
  created_at: Date;
  rank: number;
}
