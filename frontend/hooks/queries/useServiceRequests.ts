'use client';

import { useQuery } from '@tanstack/react-query';
import { serviceRequestsApi } from '@/api/service-requests.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import type { ServiceRequestsQuery } from '@/types/service.types';

/** GET /service-requests/:id — either party (customer or provider) may fetch. */
export function useServiceRequest(id: string) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.serviceRequests.detail(id),
    queryFn: () => serviceRequestsApi.getById(id).then((r) => r.data.data),
    staleTime: CACHE_TTL.serviceRequests,
    enabled: isAuthenticated && Boolean(id),
  });
}

/** GET /service-requests/me — caller's own requests as customer, paginated. */
export function useMyServiceRequests(params?: ServiceRequestsQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.serviceRequests.mine(params),
    queryFn: () => serviceRequestsApi.getMineAsCustomer(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.serviceRequests,
    enabled: isAuthenticated,
  });
}

/** GET /service-requests/incoming — caller's requests as provider, paginated. */
export function useIncomingServiceRequests(params?: ServiceRequestsQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.serviceRequests.incoming(params),
    queryFn: () => serviceRequestsApi.getIncomingAsProvider(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.serviceRequests,
    enabled: isAuthenticated,
  });
}
