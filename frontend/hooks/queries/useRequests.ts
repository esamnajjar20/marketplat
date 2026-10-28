'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { requestsApi } from '@/api/requests.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

export function useOpenRequests(params?: Parameters<typeof requestsApi.getOpenFeed>[0]) {
  return useQuery({
    queryKey: queryKeys.requests.open(params),
    queryFn: async ({ signal }) => {
      const res = await requestsApi.getOpenFeed(params, { signal });
      return res.data;
    },
    staleTime: CACHE_TTL.adsList,
    placeholderData: keepPreviousData,
  });
}

export function useMyRequests(params?: Parameters<typeof requestsApi.getMyRequests>[0]) {
  return useQuery({
    queryKey: queryKeys.requests.mine(params),
    queryFn: async ({ signal }) => {
      const res = await requestsApi.getMyRequests(params, { signal });
      return res.data;
    },
    staleTime: CACHE_TTL.myAds,
    placeholderData: keepPreviousData,
  });
}

export function useMyRequestOffers(params?: Parameters<typeof requestsApi.getMyOffers>[0]) {
  return useQuery({
    queryKey: queryKeys.requests.myOffers(params),
    queryFn: async ({ signal }) => {
      const res = await requestsApi.getMyOffers(params, { signal });
      return res.data;
    },
    staleTime: CACHE_TTL.myAds,
    placeholderData: keepPreviousData,
  });
}

export function useRequestDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.requests.detail(id),
    queryFn: async ({ signal }) => {
      const res = await requestsApi.getById(id, { signal });
      return res.data.data;
    },
    enabled: Boolean(id),
    staleTime: CACHE_TTL.adDetail,
  });
}
