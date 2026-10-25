'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toastMutationError } from '@/lib/mutationFeedback';
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
    onError: toastMutationError,
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
    onError: toastMutationError,
  });
}

/**
 * POST /service-providers/me/logo — uploads a new logo. Same
 * toast.promise shape as useUploadStoreLogo.
 */
export function useUploadServiceProviderLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => {
      const promise = serviceProvidersApi.uploadLogo(file).then((r) => r.data.data);
      toast.promise(promise, {
        loading: 'جارٍ رفع الشعار…',
        success: 'تم تحديث الشعار',
        error: (err) => parseApiError(err).message,
      });
      return promise;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceProviders.me() });
    },
  });
}
