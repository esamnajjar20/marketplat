'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { requestsApi } from '@/api/requests.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import type { RequestType } from '@/types/request.types';

export function useOpenRequests(params?: {
  page?: number;
  limit?: number;
  type?: RequestType;
  categoryId?: string;
  city?: string;
  q?: string;
}) {
  return useQuery({
    queryKey: queryKeys.requests.open(params),
    queryFn: async () => {
      const res = await requestsApi.getOpenFeed(params);
      return res.data;
    },
    staleTime: CACHE_TTL.adsList,
    placeholderData: keepPreviousData,
  });
}

export function useMyRequests(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({
    queryKey: queryKeys.requests.mine(params),
    queryFn: async () => {
      const res = await requestsApi.getMyRequests(params);
      return res.data;
    },
    staleTime: CACHE_TTL.myAds,
    placeholderData: keepPreviousData,
  });
}

export function useMyRequestOffers(params?: { page?: number; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.requests.myOffers(params),
    queryFn: async () => {
      const res = await requestsApi.getMyOffers(params);
      return res.data;
    },
    staleTime: CACHE_TTL.myAds,
    placeholderData: keepPreviousData,
  });
}

export function useRequestDetail(id: string) {
  return useQuery({
    queryKey: queryKeys.requests.detail(id),
    queryFn: async () => {
      const res = await requestsApi.getById(id);
      return res.data.data;
    },
    enabled: Boolean(id),
    staleTime: CACHE_TTL.adDetail,
  });
}
