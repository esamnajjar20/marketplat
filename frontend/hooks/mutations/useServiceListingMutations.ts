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

export function useCreateServiceListing() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (payload: CreateServiceListingPayload) =>
      serviceListingsApi.create(payload).then((r) => r.data.data),
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
