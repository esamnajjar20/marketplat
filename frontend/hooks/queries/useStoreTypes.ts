'use client';

import { useQuery } from '@tanstack/react-query';
import { storeTypesApi } from '@/api/store-types.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';

export function useStoreTypes() {
  return useQuery({
    queryKey: queryKeys.storeTypes.all(),
    queryFn: () => storeTypesApi.getAll().then((r) => r.data.data),
    staleTime: CACHE_TTL.storeTypes,
  });
}

export function useStoreTypeFields(storeTypeId?: string) {
  return useQuery({
    queryKey: queryKeys.storeTypes.fields(storeTypeId ?? ''),
    queryFn: () => storeTypesApi.getFields(storeTypeId!).then((r) => r.data.data),
    enabled: Boolean(storeTypeId),
    staleTime: 15 * 60 * 1000,
  });
}
