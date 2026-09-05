'use client';

import { Pin, PinOff } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import { toast } from 'sonner';
import { parseApiError } from '@/lib/errorParser';
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
      queryClient.invalidateQueries({ queryKey: ['ads'] });
      toast.success(next ? 'تم تثبيت الإعلان' : 'تم إلغاء التثبيت');
    },
    onError: (err) => toast.error(parseApiError(err).message),
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
