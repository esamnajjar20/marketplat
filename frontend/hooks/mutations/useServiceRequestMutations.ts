'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceRequestsApi } from '@/api/service-requests.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import type {
  CreateServiceRequestPayload,
  RespondToServiceRequestPayload,
} from '@/types/service.types';

/**
 * POST /service-requests — customer sends a request against a listing.
 * Invalidates the customer's "my requests" list so it shows up without
 * a manual refresh, mirroring useCreateServiceProvider's me()-invalidation.
 */
export function useCreateServiceRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateServiceRequestPayload) =>
      serviceRequestsApi.create(payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-requests', 'me'] });
      toast.success('تم إرسال طلبك بنجاح');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * PATCH /service-requests/:id/respond — provider or customer moves the
 * request's status forward (accept/reject/start/complete/cancel).
 * Invalidates both the detail view and both list views, since either
 * side (customer or provider) may be looking at this request when the
 * other side's action or their own action lands.
 */
export function useRespondToServiceRequest(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RespondToServiceRequestPayload) =>
      serviceRequestsApi.respond(id, payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceRequests.detail(id) });
      queryClient.invalidateQueries({ queryKey: ['service-requests', 'me'] });
      queryClient.invalidateQueries({ queryKey: ['service-requests', 'incoming'] });
      toast.success('تم تحديث حالة الطلب');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
