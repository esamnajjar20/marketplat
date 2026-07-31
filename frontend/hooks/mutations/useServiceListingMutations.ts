'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { serviceListingsApi } from '@/api/service-listings.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants';
import type {
  CreateServiceListingPayload,
  UpdateServiceListingPayload,
} from '@/types/service.types';

/**
 * UX-FIX P3-10b: accepts an optional onUploadProgress callback, same
 * pattern as useCreateAd, so ServiceListingForm can drive a real
 * progress bar in ImageUpload during the multipart upload.
 */
export function useCreateServiceListing(onUploadProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (payload: CreateServiceListingPayload) =>
      serviceListingsApi.create(payload, onUploadProgress).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() });
      toast.success('تم نشر الخدمة بنجاح');
      router.push(ROUTES.myServices);
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useUpdateServiceListing(listingId: string) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (payload: UpdateServiceListingPayload) =>
      serviceListingsApi.update(listingId, payload).then((r) => r.data.data),
    onSuccess: () => {
      // Same reasoning as useUpdateAd's I-05 fix: invalidate the whole
      // ['service-listings'] prefix, not just detail+mine, so public
      // browse/search queries don't keep showing stale data.
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() });
      toast.success('تم حفظ التعديلات');
      router.push(ROUTES.myServices);
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useDeleteServiceListing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => serviceListingsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() });
      toast.success('تم حذف الخدمة');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * EPIC 1.3: pause/resume a listing. The report's finding: PATCH
 * /service-listings/:id already accepts status (including PAUSED) —
 * "the backend PATCH ... does accept status ... it's fully functional
 * server-side, but the frontend's ServiceListingForm.tsx never sends a
 * status field, and MyServiceListingsList.tsx has no 'pause' button."
 * This is that missing button's mutation. Deliberately separate from
 * useUpdateServiceListing above (same endpoint, different UX): that
 * hook redirects to /my-services and shows a generic save toast, both
 * wrong for a one-click toggle fired from a row the user is already
 * looking at. Optimistic update mirrors
 * useToggleServiceCategoryActive's pattern in useServiceCategoryMutations.ts.
 */
export function useToggleServiceListingStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'PAUSED' }) =>
      serviceListingsApi.update(id, { status }).then((r) => r.data.data),
    onMutate: async ({ id, status }) => {
      const snapshots = queryClient.getQueriesData({ queryKey: queryKeys.serviceListings.all() });
      queryClient.setQueriesData({ queryKey: queryKeys.serviceListings.all() }, (old: any) => {
        if (!old?.items) return old;
        return { ...old, items: old.items.map((l: any) => (l.id === id ? { ...l, status } : l)) };
      });
      await queryClient.cancelQueries({ queryKey: queryKeys.serviceListings.all() });
      return { snapshots };
    },
    onSuccess: (_data, { status }) =>
      toast.success(status === 'PAUSED' ? 'تم إيقاف الخدمة مؤقتاً' : 'تمت إعادة تفعيل الخدمة'),
    onError: (err, _vars, context) => {
      context?.snapshots.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error(parseApiError(err).message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.serviceListings.all() }),
  });
}
