'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { serviceListingsApi } from '@/api/service-listings.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { ServiceListingsQuery, ServiceListingWithProvider } from '@/types/service.types';
import {
  getOfflineList,
  saveOfflineList,
  OFFLINE_LIST_KEYS,
  OFFLINE_LIST_LIMITS,
} from '@/lib/offlineListCache';

type ServicesPage = {
  items: ServiceListingWithProvider[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
};

function offlinePage(items: ServiceListingWithProvider[]): ServicesPage {
  return {
    items,
    meta: {
      total: items.length,
      page: 1,
      limit: items.length || 1,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
  };
}

/** GET /service-listings — public browse/search. */
export function useServiceListings(params?: ServiceListingsQuery) {
  const isBaseBrowse =
    (!params?.page || params.page === 1) &&
    !params?.search &&
    !params?.categoryId &&
    !params?.providerId;
  const cached = isBaseBrowse
    ? getOfflineList<ServiceListingWithProvider>(OFFLINE_LIST_KEYS.servicesBrowse)
    : null;

  return useQuery({
    queryKey: queryKeys.serviceListings.list(params),
    queryFn: async (): Promise<ServicesPage> => {
      try {
        const data = (await serviceListingsApi
          .getAll(params)
          .then((r) => r.data.data)) as ServicesPage;
        if (isBaseBrowse && data?.items?.length) {
          saveOfflineList(
            OFFLINE_LIST_KEYS.servicesBrowse,
            data.items,
            OFFLINE_LIST_LIMITS.servicesBrowse,
          );
        }
        return data;
      } catch (err) {
        if (isBaseBrowse) {
          const local = getOfflineList<ServiceListingWithProvider>(
            OFFLINE_LIST_KEYS.servicesBrowse,
          );
          if (local?.items?.length) return offlinePage(local.items);
        }
        throw err;
      }
    },
    staleTime: CACHE_TTL.adsList,
    placeholderData: keepPreviousData,
    ...(cached?.items?.length
      ? {
          initialData: offlinePage(cached.items),
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
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
export function useMyServiceListings(
  params?: ServiceListingsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.serviceListings.mine(params),
    queryFn: () => serviceListingsApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.myAds,
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}
