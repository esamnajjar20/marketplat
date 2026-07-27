'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';
import type {
  CreateServiceProviderPayload,
  UpdateServiceProviderPayload,
} from '@/types/service.types';

/**
 * POST /service-providers/me — one-time provider profile creation.
 * On success, invalidates the "my provider" query so
 * useMyServiceProvider() picks up the new profile instead of
 * continuing to show the become-a-provider CTA.
 */
export function useCreateServiceProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateServiceProviderPayload) =>
      serviceProvidersApi.createMyProvider(payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceProviders.me() });
      toast.success('تم إنشاء ملف مقدم الخدمة بنجاح');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/** PATCH /service-providers/me — partial update (settings, availability toggle). */
export function useUpdateServiceProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateServiceProviderPayload) =>
      serviceProvidersApi.updateMyProvider(payload).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceProviders.me() });
      toast.success('تم حفظ التعديلات');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
