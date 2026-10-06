'use client';

import { useQuery } from '@tanstack/react-query';
import { appointmentsApi } from '@/api/appointments.api';
import { queryKeys } from '@/lib/queryKeys';
import { CACHE_TTL } from '@/lib/constants';
import {
  useAuthStore,
  selectIsAuthenticated,
  selectHasAccessToken,
} from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { isUnfilteredFirstPage } from '@/lib/offlineCachePolicy';
import type { Appointment, AppointmentsQuery } from '@/types/service.types';
import type { PaginationMeta } from '@/types/api.types';
import {
  getOfflineJson,
  saveOfflineJson,
  OFFLINE_JSON_KEYS,
} from '@/lib/offlineJsonCache';

// FIX APPT-IMPORT-ORDER-01: this type was declared BETWEEN two import
// blocks -- legal (imports are hoisted) but reads as if it belongs to
// the first import group. Moved below so the imports form one block.
type MyAppointmentsData = {
  items: Appointment[];
  meta: PaginationMeta;
};

export function useMyAppointments(params?: AppointmentsQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  // T770 — user-scoped (appointments belong to one user only).
  const userId = useAuthStore((s) => s.user?.id ?? null);
  // T760 follow-up — same whitelist helper useStores/useServiceListings
  // now use. AppointmentsQuery is {page, limit, from, to}; the previous
  // hand-rolled check missed `limit` (a caller shrinking the page size
  // requests a different set than the browse shape), so the same
  // "later offline open shows only the small first page" class of bug
  // was still reachable here. See offlineCachePolicy.isUnfilteredFirstPage
  // for why whitelisting is the safe-by-default direction.
  const isBase = isUnfilteredFirstPage(params, {
    nonFilterFields: ['page', 'limit'],
  });

  const cached = isBase
    ? getOfflineJson<MyAppointmentsData>(
        OFFLINE_JSON_KEYS.appointmentsMine,
        userId,
      )
    : null;

  return useQuery<MyAppointmentsData>({
    queryKey: queryKeys.appointments.mine(params),

    queryFn: async (): Promise<MyAppointmentsData> => {
      try {
        const data = await appointmentsApi
          .getMine(params)
          .then((r) => r.data.data);

        if (isBase && data) {
          saveOfflineJson(OFFLINE_JSON_KEYS.appointmentsMine, {
            ...data,
            items: data.items.slice(0, 30),
          }, userId);
        }

        if (!data) throw new Error('Appointments response is empty');
        return data;
      } catch (err) {
        if (isBase) {
          const local = getOfflineJson<MyAppointmentsData>(
            OFFLINE_JSON_KEYS.appointmentsMine,
            userId,
          );

          if (local) return local.data;
        }

        throw err;
      }
    },

    staleTime: CACHE_TTL.appointments,
    enabled: isAuthenticated && (hasToken || !isOnline),

    ...(cached
      ? {
          initialData: cached.data,
          initialDataUpdatedAt: new Date(cached.savedAt).getTime(),
        }
      : {}),
  });
}

/**
 * GET /appointments/availability/:providerId?date=YYYY-MM-DD — public.
 * لا كاش أوفلاين للحجز الجديد (التوفر يتغيّر سريعًا).
 */
export function useAvailability(providerId: string, date: string) {
  return useQuery({
    queryKey: queryKeys.appointments.availability(providerId, date),
    queryFn: () => appointmentsApi.getAvailability(providerId, date).then((r) => r.data.data),
    staleTime: CACHE_TTL.availability,
    enabled: Boolean(providerId) && Boolean(date),
  });
}
