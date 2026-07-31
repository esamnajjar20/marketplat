'use client';

import { useQuery } from '@tanstack/react-query';
import { appointmentsApi } from '@/api/appointments.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import type { AppointmentsQuery } from '@/types/service.types';

/** GET /appointments/me — caller's own appointments as provider, paginated. */
export function useMyAppointments(params?: AppointmentsQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  return useQuery({
    queryKey: queryKeys.appointments.mine(params),
    queryFn: () => appointmentsApi.getMine(params).then((r) => r.data.data),
    staleTime: CACHE_TTL.appointments,
    enabled: isAuthenticated,
  });
}

/**
 * GET /appointments/availability/:providerId?date=YYYY-MM-DD — public,
 * no auth required (matches appointments.routes.ts). Callers pass a
 * YYYY-MM-DD date string, not a full ISO datetime.
 */
export function useAvailability(providerId: string, date: string) {
  return useQuery({
    queryKey: queryKeys.appointments.availability(providerId, date),
    queryFn: () => appointmentsApi.getAvailability(providerId, date).then((r) => r.data.data),
    staleTime: CACHE_TTL.availability,
    enabled: Boolean(providerId) && Boolean(date),
  });
}
