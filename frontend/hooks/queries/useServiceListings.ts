'use client';

import { useQuery } from '@tanstack/react-query';
import { serviceListingsApi } from '@/api/service-listings.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { ServiceListingsQuery } from '@/types/service.types';

/** GET /service-listings — public browse/search. */
export function useServiceListings(params?: ServiceListingsQuery) {
  return useQuery({
    queryKey: queryKeys.serviceListings.list(params),
    queryFn: () => serviceListingsApi.getAll(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.adsList,
  });
}

/** GET /service-listings/:id — public detail. */
export function useServiceListing(id: string) {
  return useQuery({
    queryKey: queryKeys.serviceListings.detail(id),
    queryFn: () => serviceListingsApi.getById(id).then((r) => r.data.data),
    staleTime: CACHE_TTL.adDetail,
    enabled: Boolean(id),
  });
}

/** GET /service-listings/me — caller's own listings (my-services page). */
export function useMyServiceListings(params?: ServiceListingsQuery) {
  return useQuery({
    queryKey: queryKeys.serviceListings.mine(params),
    queryFn: () => serviceListingsApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.myAds,
  });
}
