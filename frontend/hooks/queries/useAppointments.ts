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
import type { Appointment, AppointmentsQuery } from '@/types/service.types';
import type { PaginationMeta } from '@/types/api.types';

type MyAppointmentsData = {
  items: Appointment[];
  meta: PaginationMeta;
};
import {
  getOfflineJson,
  saveOfflineJson,
  OFFLINE_JSON_KEYS,
} from '@/lib/offlineJsonCache';

/** GET /appointments/me — مع كاش أوفلاين محدود للصفحة الأولى. */
export function useMyAppointments(params?: AppointmentsQuery) {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const hasToken = useAuthStore(selectHasAccessToken);
  const isOnline = useOnlineStatus();
  const isBase = !params?.page || params.page === 1;

  const cached = isBase
    ? getOfflineJson<MyAppointmentsData>(
        OFFLINE_JSON_KEYS.appointmentsMine,
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
          });
        }

        if (!data) throw new Error('Appointments response is empty');
        return data;
      } catch (err) {
        if (isBase) {
          const local = getOfflineJson<MyAppointmentsData>(
            OFFLINE_JSON_KEYS.appointmentsMine,
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
