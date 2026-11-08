import type { ServiceListingStatus } from '@/types/service.types';

export interface MyServicesWorkspaceParams {
  page: number;
  limit: 10;
  status?: ServiceListingStatus;
  search?: string;
}

const VALID_STATUSES = new Set<ServiceListingStatus>(['ACTIVE', 'PAUSED', 'DELETED']);

/** Keep the dashboard and listing component on an identical, canonical query shape. */
export function normalizeMyServicesWorkspaceParams(input: {
  page?: number;
  status?: string;
  search?: string;
}): MyServicesWorkspaceParams {
  const page = Number.isInteger(input.page) && Number(input.page) > 0 ? Number(input.page) : 1;
  const status = input.status && VALID_STATUSES.has(input.status as ServiceListingStatus)
    ? (input.status as ServiceListingStatus)
    : undefined;
  const search = input.search?.trim() || undefined;

  return {
    page,
    limit: 10,
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  };
}

export function myServicesWorkspaceParamsFromSearchParams(
  searchParams: Pick<URLSearchParams, 'get'>,
): MyServicesWorkspaceParams {
  const rawPage = Number(searchParams.get('page') ?? 1);
  return normalizeMyServicesWorkspaceParams({
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    status: searchParams.get('status') ?? undefined,
    search: searchParams.get('q') ?? undefined,
  });
}
