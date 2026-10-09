'use client';

import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invalidateAdEntityCaches } from '@/lib/queryInvalidation';
import { apiClient } from '@/api/client';
import { toast } from 'sonner';
import { toastMutationError } from '@/lib/mutationFeedback';
import type { ApiResponse } from '@/types/api.types';

interface Props {
  adId: string;
  isPinned: boolean;
  className?: string;
}

export function PinAdButton({ adId, isPinned, className }: Props) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (next: boolean) =>
      apiClient
        .patch<ApiResponse<unknown>>(`/ads/${adId}/pin`, { isPinned: next })
        .then((r) => r.data.data),
    onSuccess: (_data, next) => {
      void invalidateAdEntityCaches(queryClient, adId);
      toast.success(next ? 'تم تثبيت الإعلان' : 'تم إلغاء التثبيت');
    },
    // FIX OFFLINE-QUEUED-TOAST-01: كان onError يعرض toast.error بلا تمييز
    // عن حالة "تم قبول الطلب أوفلاين بطابور SW" (202 {queued:true}) —
    // بائع يضغط تثبيت وهو أوفلاين كان يشوف تنبيه أحمر "فشل" لعملية نجحت
    // فعليًا وهتترسل تلقائيًا. انظر lib/mutationFeedback.ts.
    onError: toastMutationError,
  });

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={className}
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(!isPinned)}
    >
      {isPinned ? (
        <>
          <PinOff className="h-3.5 w-3.5 ms-1" />
          إلغاء التثبيت
        </>
      ) : (
        <>
          <Pin className="h-3.5 w-3.5 ms-1" />
          تثبيت
        </>
      )}
    </Button>
  );
}
