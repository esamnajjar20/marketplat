'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appointmentsApi } from '@/api/appointments.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import type {
  CreateAppointmentPayload,
  UpdateAppointmentStatusPayload,
} from '@/types/service.types';

/**
 * POST /appointments — provider books a slot (optionally against an
 * ACCEPTED/IN_PROGRESS service request). Invalidates the provider's own
 * appointment list and, when the booking is tied to a request, that
 * request's caches too — MyServiceRequestsList/IncomingServiceRequestsList
 * don't show appointment state directly, but a provider may have both
 * views open, so the same broad invalidation useRespondToServiceRequest
 * already does for its own mutation is repeated here for consistency.
 */
export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateAppointmentPayload) =>
      appointmentsApi.create(payload).then((r) => r.data.data),
    onSuccess: (appointment) => {
      queryClient.invalidateQueries({ queryKey: ['appointments', 'me'] });
      if (appointment?.providerId) {
        queryClient.invalidateQueries({
          queryKey: ['appointments', 'availability'],
        });
      }
      toast.success('تم حجز الموعد بنجاح');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * PATCH /appointments/:id/status — provider marks an appointment
 * COMPLETED / CANCELLED / NO_SHOW. Only legal from SCHEDULED
 * (appointments.service.ts's own guard) — enforced server-side, this
 * hook just surfaces whatever error that guard returns.
 */
export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateAppointmentStatusPayload }) =>
      appointmentsApi.updateStatus(id, payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.mine() });
      queryClient.invalidateQueries({ queryKey: ['appointments', 'me'] });
      toast.success('تم تحديث حالة الموعد');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
