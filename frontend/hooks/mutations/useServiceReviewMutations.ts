'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceReviewsApi } from '@/api/service-reviews.api';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import type { CreateServiceReviewPayload } from '@/types/service.types';

/**
 * POST /service-reviews — customer reviews a COMPLETED request, once.
 * The mutation only ever knows requestId (score/comment come from the
 * form); it doesn't know which sellerProfileId that resolves to — the
 * backend looks that up itself from the request (service-reviews.service.ts).
 * So invalidation targets the whole `service-reviews` key prefix rather
 * than a specific seller, same tradeoff as invalidating both
 * ['service-requests','me'] and ['service-requests','incoming'] broadly
 * in useRespondToServiceRequest.
 */
export function useCreateServiceReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateServiceReviewPayload) =>
      serviceReviewsApi.create(payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-reviews'] });
      // The reviewed request's own list entries don't change shape, but
      // re-fetching lets "already reviewed" UI state in
      // MyServiceRequestsList pick up immediately rather than waiting
      // for CACHE_TTL.serviceRequests to lapse.
      queryClient.invalidateQueries({ queryKey: ['service-requests', 'me'] });
      toast.success('تم إرسال تقييمك بنجاح');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
