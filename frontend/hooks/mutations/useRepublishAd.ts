'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { republishAd } from '@/api/ads-republish.api';
import { queryKeys } from '@/lib/queryKeys';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast } from 'sonner';

export function useRepublishAd() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (adId: string) => republishAd(adId).then((r) => r.data.data),
    onSuccess: (_data, adId) => {
      // FIX REPUBLISH-INVALIDATION-01: was only invalidating ads.mine(),
      // which is the screen the button sits on — so the /my-ads list
      // updates and the change looks complete. Two other caches went
      // stale behind it:
      //
      //   - ads.detail(adId): the ad's own detail page. A user who
      //     republished and then opened the ad directly saw the
      //     pre-republish state (SOLD/PAUSED) for up to 120s
      //     (CACHE_TTL.adDetail).
      //   - ads.all(): the public browse/search prefix. The ad was
      //     just set back to ACTIVE but did not reappear in /ads
      //     results for up to 30s (CACHE_TTL.adsList).
      //
      // Same treatment useUpdateAd / useMarkAsSold / useAddAdImages
      // already apply under FIX I-05 / I-05b — republish is a state
      // change on the ad row just like those, and every one of the
      // four should invalidate the same set.
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.mine() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.detail(adId) });
      toast.success('تم إعادة نشر الإعلان');
    },
    onError: toastMutationError,
  });
}
