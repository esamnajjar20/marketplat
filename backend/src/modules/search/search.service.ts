import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { searchRepository } from './search.repository';
import { SearchQuery, SearchSuggestionsQuery } from './search.validation';
import { RawSearchRow, SearchResult, UnifiedSearchResponse } from './search.types';
import { analyzeSearchQuery } from '../../shared/utils/searchQueryIntelligence';


/** المسافات غير المنطقية (مثل ~20015 = π×6371 من clamp لـ acos) تُعامل كـ null. */
function sanitizeDistanceKm(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 500) return null;
  return n;
}


const SUGGESTIONS_TTL = 5 * 60; // 5 minutes — design doc's 5-10min window, low end since categories/products change more often than the ads-search's own 1hr categories cache
const SUGGESTIONS_LIMIT = 8;
const _suggestL1 = new Map<string, { at: number; value: string[] }>();
const SUGGEST_L1_MS = 30_000;

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
    // FIX SEARCH-PREFERRED-TYPES-SQL-01: analyze once, pass preferredTypes
    // into the repository so the boost is applied in the SQL ORDER BY
    // CASE — before OFFSET/LIMIT. The previous version re-sorted the
    // already-paginated page in JS, which meant a preferred-type match
    // on page 2 could never outrank a non-preferred match on page 1:
    // the entire feature only reordered items within whatever page the
    // user happened to be looking at.
    //
    // Only computed when there's an actual query string (a pure browse
    // with no q has no intent to detect) and only for relevance sort
    // (explicit newest/rating/views/distance must not be overridden).
    const sort = query.sort ?? 'relevance';
    const preferredTypes =
      sort === 'relevance' && query.q?.trim()
        ? analyzeSearchQuery(query.q).preferredTypes
        : [];

    const { rows, total } = await searchRepository.search(query, preferredTypes);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const results = rows.map(normalizeRow);

    return {
      results,
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

    // FIX SEARCH-L1-LRU-01: same LRU touch as userCache.ts / unread
    // NotificationsCache.ts. Without it, the eviction on `_suggestL1.size
    // > 500` below is FIFO — a hot prefix that was inserted early gets
    // evicted before a cold one inserted moments later. Under any
    // realistic autocomplete traffic the same small set of prefixes
    // (the top brands/categories typed repeatedly) is what actually
    // benefits from L1, and those are exactly what a FIFO policy
    // throws away first. Also cleans up expired entries on read here
    // rather than leaving them to occupy a slot until the size cap
    // forces a delete of a possibly-fresher entry.
    const l1 = _suggestL1.get(cacheKey);
    if (l1) {
      if (Date.now() - l1.at < SUGGEST_L1_MS) {
        _suggestL1.delete(cacheKey);
        _suggestL1.set(cacheKey, l1);
        return l1.value;
      }
      _suggestL1.delete(cacheKey);
    }

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as string[];
        _suggestL1.set(cacheKey, { at: Date.now(), value: parsed });
        return parsed;
      }
    } catch {
      logger.warn('Search suggestions cache read failed, falling back to DB');
    }

    const suggestions = await searchRepository.suggest(query.q, SUGGESTIONS_LIMIT);
    _suggestL1.set(cacheKey, { at: Date.now(), value: suggestions });
    if (_suggestL1.size > 500) {
      const first = _suggestL1.keys().next().value;
      if (first) _suggestL1.delete(first);
    }

    try {
      await redis.setex(cacheKey, SUGGESTIONS_TTL, JSON.stringify(suggestions));
    } catch {
      // Fail silently — DB result is still returned
    }

    return suggestions;
  },
};
