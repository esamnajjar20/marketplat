'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { appointmentsApi } from '@/api/appointments.api';
import { queryKeys } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';
import { isNetworkLikeFailure } from '@/lib/isNetworkLikeFailure';
import { parseApiError } from '@/lib/errorParser';
import { useAuthStore } from '@/store/auth.store';
import { saveOfflineAppointmentDraft } from '@/lib/offlineAppointmentDrafts';
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
  const userId = useAuthStore((state) => state.user?.id ?? null);

  return useMutation({
    mutationFn: (payload: CreateAppointmentPayload) =>
      appointmentsApi.create(payload).then((r) => r.data.data),
    onSuccess: (appointment) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.mineRoot() });
      if (appointment?.providerId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.appointments.availabilityRoot(),
        });
      }
      // UX-01 FIX: the comment above always claimed this repeats
      // useRespondToServiceRequest's broad invalidation, but the code
      // never actually invalidated any service-request keys — a
      // provider with MyServiceRequestsList/IncomingServiceRequestsList
      // open would keep seeing a stale request after booking against
      // it. `requestId` (not `serviceRequestId`) is the actual field on
      // Appointment; matching useRespondToServiceRequest's three keys.
      if (appointment?.requestId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.serviceRequests.mineRoot(),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.serviceRequests.incomingRoot(),
        });
      }
      toast.success('تم حجز الموعد بنجاح');
    },
    onError: async (error, payload) => {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const parsed = parseApiError(error);
      if (offline || isNetworkLikeFailure(parsed)) {
        if (!userId) { toast.error('سجّل الدخول قبل حفظ طلب الموعد أوفلاين'); return; }
        try {
          await saveOfflineAppointmentDraft(userId, payload);
          toast.message('حُفظ طلب الموعد على الجهاز', { description: 'لم يتأكد الحجز بعد. عند عودة الإنترنت افتح مركز المزامنة وأعد التحقق من الموعد ثم أرسله.', duration: 9000 });
          return;
        } catch (saveError) { console.error('[offline-appointments] draft save failed', saveError); }
      }
      toastMutationError(error);
    },
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
      // The root prefix covers every filtered/paginated appointment list.
      queryClient.invalidateQueries({ queryKey: queryKeys.appointments.mineRoot() });
      toast.success('تم تحديث حالة الموعد');
    },
    onError: toastMutationError,
  });
}
