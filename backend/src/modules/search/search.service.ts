import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { searchRepository } from './search.repository';
import { SearchQuery, SearchSuggestionsQuery } from './search.validation';
import { RawSearchRow, SearchResult, UnifiedSearchResponse } from './search.types';


/** المسافات غير المنطقية (مثل ~20015 = π×6371 من clamp لـ acos) تُعامل كـ null. */
function sanitizeDistanceKm(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 500) return null;
  return n;
}


const SUGGESTIONS_TTL = 5 * 60; // 5 minutes — design doc's 5-10min window, low end since categories/products change more often than the ads-search's own 1hr categories cache
const SUGGESTIONS_LIMIT = 8;

const suggestionsCacheKey = (q: string): string =>
  // Lowercased so "iPhone" and "iphone" share a cache entry — the
  // underlying ILIKE match is already case-insensitive, the cache key
  // should be too, or it silently fragments into near-duplicate entries.
  `search:suggestions:${q.trim().toLowerCase()}`;

// Normalizes one raw UNION row (see search.repository.ts's RawSearchRow)
// into the entity-agnostic shape the frontend actually consumes. This
// is the single place that "type doesn't matter after this" becomes
// true — everything upstream still has to know which entity it's
// touching, everything downstream of here doesn't.
const normalizeRow = (row: RawSearchRow): SearchResult => ({
  id: row.id,
  type: row.type,
  title: row.title,
  description: row.description,
  image: row.image,
  city: row.city,
  rating: row.rating,
  views: row.views,
  price: row.price,
  seller: {
    id: row.seller_id,
    name: row.seller_name,
    verified: row.seller_verified,
    // FIX M-023: see SearchResultSeller.type's own comment in
    // search.types.ts — carries through the entity kind computed per
    // branch in search.repository.ts's SELECT list.
    type: row.seller_type,
  },
  url: searchRepository.buildUrl(row.type, row.url_id),
  createdAt: row.created_at.toISOString(),
  distanceKm: sanitizeDistanceKm(row.distance_km),
  latitude: row.latitude != null ? Number(row.latitude) : null,
  longitude: row.longitude != null ? Number(row.longitude) : null,
});

export const searchService = {
  search: async (query: SearchQuery): Promise<UnifiedSearchResponse> => {
    const { rows, total } = await searchRepository.search(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    return {
      results: rows.map(normalizeRow),
      pagination: buildPaginationMeta(total, page, limit),
    };
  },

  // P-04-style Redis cache (same read-through pattern as
  // categoriesService.getCategories) — autocomplete fires on every
  // keystroke, so a cache hit here matters far more than on a typical
  // list endpoint. Failures fall through to the DB rather than erroring,
  // same "cache miss is acceptable" convention as categories.service.ts.
  suggest: async (query: SearchSuggestionsQuery): Promise<string[]> => {
    const cacheKey = suggestionsCacheKey(query.q);

    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as string[];
    } catch {
      logger.warn('Search suggestions cache read failed, falling back to DB');
    }

    const suggestions = await searchRepository.suggest(query.q, SUGGESTIONS_LIMIT);

    try {
      await redis.setex(cacheKey, SUGGESTIONS_TTL, JSON.stringify(suggestions));
    } catch {
      // Fail silently — DB result is still returned
    }

    return suggestions;
  },
};
