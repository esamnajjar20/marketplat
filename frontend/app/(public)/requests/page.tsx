import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { fetchServerApi } from '@/lib/server/serverApiFetch';
import { RequestsPageShell, type OpenRequestsPageParams } from '@/components/requests/RequestsPageShell';
import type { RequestListItem, RequestType } from '@/types/request.types';
import type { RequestSort } from '@/components/requests/RequestFilters';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positivePage(value: string | undefined): number {
  const parsed = Number(value ?? 1);
  return Number.isSafeInteger(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

function parseType(value: string | undefined): RequestType | undefined {
  return value === 'SERVICE' || value === 'PRODUCT' || value === 'RENTAL' ? value : undefined;
}

function parseSort(value: string | undefined): RequestSort {
  return value === 'expiring' || value === 'budget_high' || value === 'fewest_offers'
    ? value
    : 'newest';
}

function toQueryString(params: OpenRequestsPageParams): string {
  const query = new URLSearchParams();
  query.set('page', String(params.page));
  query.set('limit', String(params.limit));
  if (params.type) query.set('type', params.type);
  if (params.city) query.set('city', params.city);
  if (params.serviceTypeId) query.set('serviceTypeId', params.serviceTypeId);
  if (params.q) query.set('q', params.q);
  if (params.sort !== 'newest') query.set('sort', params.sort);
  return query.toString();
}

/**
 * The open requests feed is public and URL-driven. Read its first page on the
 * server and hydrate the exact query key consumed by useOpenRequests(); the
 * interactive filters still navigate through the URL and subsequent pages
 * continue to use the existing client query hook.
 */
export default async function OpenRequestsPage({ searchParams }: Props) {
  const raw = await searchParams;
  const type = parseType(first(raw.type));
  const params: OpenRequestsPageParams = {
    page: positivePage(first(raw.page)),
    limit: 20,
    type,
    city: first(raw.city)?.trim() || undefined,
    serviceTypeId: type === 'SERVICE' ? first(raw.serviceTypeId)?.trim() || undefined : undefined,
    q: first(raw.q)?.trim() || undefined,
    sort: parseSort(first(raw.sort)),
  };

  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.requests.open(params),
    queryFn: () => fetchServerApi<RequestListItem[]>(`/requests?${toQueryString(params)}`, {
      mode: 'no-store',
      timeoutMs: 3_000,
    }),
    staleTime: CACHE_TTL.adsList,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <RequestsPageShell params={params} />
    </HydrationBoundary>
  );
}
