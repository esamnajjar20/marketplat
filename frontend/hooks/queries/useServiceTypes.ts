'use client';

import { useQuery } from '@tanstack/react-query';
import { serviceTypesApi } from '@/api/service-types.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

export function useServiceTypes() {
  return useQuery({
    queryKey: queryKeys.serviceTypes.all(),
    queryFn: ({ signal }) => serviceTypesApi.getAll({ signal }).then((r) => r.data.data),
    staleTime: CACHE_TTL.categories,
  });
}

export function useServiceTypesForAdmin() {
  return useQuery({
    queryKey: queryKeys.serviceTypes.adminAll(),
    queryFn: ({ signal }) => serviceTypesApi.getAllForAdmin({ signal }).then((r) => r.data.data),
    staleTime: 0,
  });
}
