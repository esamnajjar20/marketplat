'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { republishAd } from '@/api/ads-republish.api';
import { queryKeys } from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast } from 'sonner';

export function useRepublishAd() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (adId: string) => republishAd(adId).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.mine() });
      toast.success('تم إعادة نشر الإعلان');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
