/**
 * useReportAd — reports an ad for review by an admin.
 *
 * FIX INTEG-07: api/reports.api.ts (reportsApi.reportAd) and the backend
 * POST /reports/ads/:adId endpoint were both fully implemented and
 * covered by thin-wrappers.test.ts, but no mutation hook ever called it
 * — the "الإبلاغ عن هذا الإعلان" button in AdDetail.tsx had no onClick
 * at all. This wires it up, following useAdMutations.ts's pattern.
 */
'use client';

import { useMutation } from '@tanstack/react-query';
import { reportsApi, type CreateReportPayload } from '@/api/reports.api';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';

export function useReportAd(adId: string) {
  return useMutation({
    mutationFn: (payload: CreateReportPayload) =>
      reportsApi.reportAd(adId, payload).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('تم إرسال بلاغك، شكراً لك');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

// FEAT-REPORT-USER-STORE: same pattern as useReportAd — the "الإبلاغ عن
// هذا المستخدم" button on a profile page had no mutation to call before
// this, same gap FIX INTEG-07 closed for ads.
export function useReportUser(userId: string) {
  return useMutation({
    mutationFn: (payload: CreateReportPayload) =>
      reportsApi.reportUser(userId, payload).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('تم إرسال بلاغك، شكراً لك');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

// FEAT-REPORT-USER-STORE
export function useReportStore(storeId: string) {
  return useMutation({
    mutationFn: (payload: CreateReportPayload) =>
      reportsApi.reportStore(storeId, payload).then((r) => r.data.data),
    onSuccess: () => {
      toast.success('تم إرسال بلاغك، شكراً لك');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
