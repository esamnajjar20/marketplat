/**
 * Facets service — thin cache layer over the repository.
 * Merge into search.service.ts as `searchService.facets`.
 */

import { redis } from '../../config/redis';
import { logger } from '../../../shared/utils/logger';
import type { SearchFacetsQuery } from './search.facets.validation';
import type { SearchFacetsResponse } from './search.facets.types';
import { searchFacetsRepository } from './search.facets.repository';

const FACETS_TTL = 30; // seconds — matches CACHE.SHORT

function facetsCacheKey(q: SearchFacetsQuery): string {
  // Stable key from sorted filter fields (ignore undefined).
  const parts = [
    q.q?.trim().toLowerCase() ?? '',
    q.type ?? 'all',
    q.city ?? '',
    q.categoryId ?? '',
    q.minPrice ?? '',
    q.maxPrice ?? '',
    q.condition ?? '',
    q.lat ?? '',
    q.lng ?? '',
    q.radius ?? '',
  ];
  return `search:facets:${parts.join('|')}`;
}

export async function getSearchFacets(
  query: SearchFacetsQuery,
): Promise<SearchFacetsResponse> {
  const key = facetsCacheKey(query);

  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as SearchFacetsResponse;
  } catch (err) {
    logger.warn(`facets redis get failed — falling through: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result = await searchFacetsRepository.facets(query);

  try {
    await redis.set(key, JSON.stringify(result), 'EX', FACETS_TTL);
  } catch (err) {
    logger.warn(`facets redis set failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
}
