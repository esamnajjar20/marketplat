/**
 * Facet aggregation repository — Phase 2.
 *
 * Integrate into search.repository.ts as `searchRepository.facets(query)`.
 *
 * Strategy (pragmatic, matches existing UNION search):
 *  1. Build a filtered id-set CTE per entity type using the SAME
 *     WHERE clauses as the main search branches (q, city, price, …)
 *     but OMIT the dimension being aggregated.
 *  2. Aggregate with GROUP BY on that dimension.
 *  3. Cap each facet list (top 20 cities / categories) to keep payload small.
 *
 * NOTE: Exact SQL column names must match prisma schema
 * (ads.city, ads.condition, ads."categoryId", products…, etc.).
 * Review search.repository.ts adBranch/productBranch before merging.
 *
 * Performance:
 *  - Rely on existing search indexes (city, categoryId, price, full-text).
 *  - Prefer a single round-trip with multiple result sets, or 4 parallel
 *    lightweight queries via Promise.all (as sketched below).
 */

import { prisma } from '../../config/prisma'; // adjust path to project
import type { SearchFacetsQuery } from './search.facets.validation';
import type { SearchFacetsResponse, FacetBucket } from './search.facets.types';

const TOP_N = 20;

/** Price range buckets aligned with frontend PRICE_PRESETS. */
const PRICE_BUCKETS: { value: string; label: string; min?: number; max?: number }[] = [
  { value: 'any', label: 'أي سعر' },
  { value: '0-50', label: 'أقل من 50', max: 50 },
  { value: '50-100', label: '50 – 100', min: 50, max: 100 },
  { value: '100-250', label: '100 – 250', min: 100, max: 250 },
  { value: '250-500', label: '250 – 500', min: 250, max: 500 },
  { value: '500+', label: 'أكثر من 500', min: 500 },
];

/**
 * Minimal illustration using Prisma groupBy on Ads only.
 * Production should UNION ads + products + services (and stores where
 * applicable) the same way search.repository.search does.
 *
 * Replace body with raw SQL via prisma.$queryRaw when merging — the
 * existing repository already prefers $queryRaw for the UNION path.
 */
export async function facetsFromAds(
  query: SearchFacetsQuery,
): Promise<Pick<SearchFacetsResponse, 'cities' | 'conditions' | 'categories' | 'total'>> {
  // Base where — omit city when aggregating cities, etc.
  const baseWhere: Record<string, unknown> = {
    status: 'ACTIVE',
    deletedAt: null,
  };
  if (query.q?.trim()) {
    // Prefer the same text-match helper used in search.repository
    baseWhere.OR = [
      { title: { contains: query.q, mode: 'insensitive' } },
      { description: { contains: query.q, mode: 'insensitive' } },
    ];
  }
  if (query.minPrice != null || query.maxPrice != null) {
    baseWhere.price = {
      ...(query.minPrice != null ? { gte: query.minPrice } : {}),
      ...(query.maxPrice != null ? { lte: query.maxPrice } : {}),
    };
  }
  if (query.condition) baseWhere.condition = query.condition;
  if (query.categoryId) baseWhere.categoryId = query.categoryId;
  if (query.city) baseWhere.city = query.city;

  // city is required String on Ad — no `{ not: null }` filter (Prisma rejects it).
  // condition / categoryId are optional — filter nulls after groupBy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adWhere = baseWhere as any;

  const [cityGroups, conditionGroups, categoryGroups, total] = await Promise.all([
    prisma.ad.groupBy({
      by: ['city'],
      where: adWhere,
      _count: { _all: true },
      orderBy: { _count: { city: 'desc' } },
      take: TOP_N,
    }),
    prisma.ad.groupBy({
      by: ['condition'],
      where: { ...adWhere, condition: { not: null } },
      _count: { _all: true },
    }),
    prisma.ad.groupBy({
      by: ['categoryId'],
      where: { ...adWhere, categoryId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { categoryId: 'desc' } },
      take: TOP_N,
    }),
    prisma.ad.count({ where: adWhere }),
  ]);

  const cities: FacetBucket[] = cityGroups
    .filter((g) => Boolean(g.city))
    .map((g) => ({
      value: g.city,
      label: g.city,
      count: g._count._all,
    }));

  const conditions: FacetBucket[] = conditionGroups
    .filter((g) => g.condition != null)
    .map((g) => ({
      value: g.condition as string,
      label: g.condition as string, // map via CONDITION labels on the client
      count: g._count._all,
    }));

  // category labels: join Category table or resolve on the client from cached categories
  const categories: FacetBucket[] = categoryGroups
    .filter((g) => g.categoryId != null)
    .map((g) => ({
      value: g.categoryId as string,
      label: g.categoryId as string,
      count: g._count._all,
    }));

  return { cities, conditions, categories, total };
}

export async function computePriceRangeFacets(
  query: SearchFacetsQuery,
): Promise<FacetBucket[]> {
  // Parallel count per bucket; for production consider a single
  // FILTER (WHERE …) SQL aggregation.
  const results = await Promise.all(
    PRICE_BUCKETS.map(async (b) => {
      if (b.value === 'any') {
        return { value: b.value, label: b.label, count: -1 }; // filled by total
      }
      const where: Record<string, unknown> = {
        status: 'ACTIVE',
        deletedAt: null,
        price: {
          ...(b.min != null ? { gte: b.min } : {}),
          ...(b.max != null ? { lte: b.max } : {}),
        },
      };
      if (query.city) where.city = query.city;
      if (query.categoryId) where.categoryId = query.categoryId;
      if (query.condition) where.condition = query.condition;
      const count = await prisma.ad.count({ where });
      return { value: b.value, label: b.label, count };
    }),
  );
  return results;
}

/**
 * Public entry — expand to multi-entity UNION before production use.
 */
export const searchFacetsRepository = {
  async facets(query: SearchFacetsQuery): Promise<SearchFacetsResponse> {
    const [core, priceRanges] = await Promise.all([
      facetsFromAds(query),
      computePriceRangeFacets(query),
    ]);

    const priceWithTotal = priceRanges.map((p) =>
      p.value === 'any' ? { ...p, count: core.total } : p,
    );

    return {
      ...core,
      priceRanges: priceWithTotal,
    };
  },
};
