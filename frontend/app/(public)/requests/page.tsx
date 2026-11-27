import { HydrationBoundary, dehydrate } from '@tanstack/react-query';
import { getQueryClient } from '@/lib/queryClient';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { fetchServerApi } from '@/lib/server/serverApiFetch';
import { RequestsPageShell, type OpenRequestsPageParams } from '@/components/requests/RequestsPageShell';
import type { RequestListItem, RequestType } from '@/types/request.types';
import type { RequestSort } from '@/components/requests/RequestFilters';
import { buildFilterParams, normalizeFilterPage, parseFilterEnum } from '../../../../shared/filters';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positivePage(value: string | undefined): number {
  return normalizeFilterPage(value);
}

function parseType(value: string | undefined): RequestType | undefined {
  return parseFilterEnum(value, ['SERVICE', 'PRODUCT', 'RENTAL'] as const);
}

function parseSort(value: string | undefined): RequestSort {
  return value === 'expiring' || value === 'budget_high' || value === 'fewest_offers'
    ? value
    : 'newest';
}

function toQueryString(params: OpenRequestsPageParams): string {
  return buildFilterParams({
    page: params.page,
    limit: params.limit,
    type: params.type,
    city: params.city,
    serviceTypeId: params.serviceTypeId,
    q: params.q,
    sort: params.sort !== 'newest' ? params.sort : undefined,
  }, { profile: 'openRequests' }).toString();
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
