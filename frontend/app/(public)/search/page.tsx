import type { Metadata } from 'next';
import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { fetchServerApi } from '@/lib/server/serverApiFetch';
import { buildMetadata } from '@/lib/seo';
import type { SearchQuery, SearchResult, SearchSort, SearchType } from '@/types/search.types';
import type { PaginationMeta } from '@/types/api.types';
import { SearchPageClient } from '@/components/search/SearchPageClient';

export const metadata: Metadata = buildMetadata({ title: 'البحث', noIndex: true });

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const INITIAL_SEARCH_PAGE_SIZE = 10;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function finiteNumber(value: string | undefined): number | undefined {
  if (!value || value.trim() === '') return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function makeSearchQuery(raw: Record<string, string | string[] | undefined>): SearchQuery {
  const type = (first(raw.type) ?? 'all') as SearchType;
  const q = first(raw.q);
  const city = first(raw.city);
  const categoryId = first(raw.categoryId);
  const condition = type === 'ads'
    ? first(raw.condition) as SearchQuery['condition']
    : undefined;
  const sort = (first(raw.sort) ?? 'relevance') as SearchSort;
  const rawLat = finiteNumber(first(raw.lat));
  const rawLng = finiteNumber(first(raw.lng));
  // The backend requires coordinates as a pair. Ignore a malformed half-pair
  // rather than sending a request that can only fail validation.
  const hasCoordinates = rawLat !== undefined && rawLng !== undefined;
  const radiusValue = finiteNumber(first(raw.radius));

  return {
    q,
    city,
    type,
    categoryId,
    minPrice: finiteNumber(first(raw.minPrice)),
    maxPrice: finiteNumber(first(raw.maxPrice)),
    condition,
    sort: hasCoordinates && (sort === 'relevance' || sort === 'distance') ? 'distance' : sort,
    ...(hasCoordinates ? { lat: rawLat, lng: rawLng } : {}),
    radius: radiusValue,
  };
}

function toSearchPath(query: SearchQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...query, page: 1, limit: INITIAL_SEARCH_PAGE_SIZE })) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  return `/search?${params.toString()}`;
}

const EMPTY_META: PaginationMeta = {
  total: 0,
  page: 1,
  limit: INITIAL_SEARCH_PAGE_SIZE,
  totalPages: 0,
  hasNextPage: false,
  hasPrevPage: false,
};

export default async function SearchPage({ searchParams }: Props) {
  const raw = await searchParams;
  const search = makeSearchQuery(raw);
  const pageSize = INITIAL_SEARCH_PAGE_SIZE;
  const queryKey = queryKeys.search.infinite({
    q: search.q,
    city: search.city,
    type: search.type,
    categoryId: search.categoryId,
    minPrice: search.minPrice,
    maxPrice: search.maxPrice,
    condition: search.condition,
    sort: search.sort,
    lat: search.lat,
    lng: search.lng,
    radius: search.radius,
    pageSize,
  });

  const queryClient = getQueryClient();
  // GPS-based searches are intentionally left to the browser's progressive
  // radius resolver. Other filters are safe for SSR and are never persisted
  // in Next Data Cache because the combinations have high cardinality.
  if (search.lat === undefined && search.lng === undefined) {
    try {
      const response = await fetchServerApi<SearchResult[]>(toSearchPath(search), {
        mode: 'no-store',
        timeoutMs: 3_000,
      });
      const firstPage = {
        items: response.data ?? [],
        meta: response.meta?.pagination ?? EMPTY_META,
      };
      queryClient.setQueryData(queryKey, {
        pages: [firstPage],
        pageParams: [1],
      });
    } catch {
      // Keep the client query as a resilient fallback if the server API is down.
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SearchPageClient query={search.q ?? ''} pageSize={pageSize} />
    </HydrationBoundary>
  );
}
