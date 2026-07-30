/**
 * Ad create/update/delete/mark-as-sold mutations.
 *
 * FIX I-04: addImages and removeImage are wired back in below — AdForm's
 * edit mode now has a working image add/remove UI (ImageUpload with
 * onRemoveExisting), but until this fix the form silently dropped any
 * image change because UpdateAdPayload excludes `images` and nothing
 * called the dedicated POST/DELETE /ads/:id/images endpoints.
 *
 * FIX I-05: useUpdateAd / useMarkAsSold now also invalidate ads.all()
 * (the ['ads'] prefix covering public list/search queries), not just
 * detail + mine. Previously a sold/edited ad could keep appearing as
 * available in already-cached public listings until staleTime expired.
 *
 * Each hook below is imported directly by name, e.g.:
 *   import { useCreateAd, useUpdateAd } from '@/hooks/mutations/useAdMutations';
 */
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter }     from 'next/navigation';
import { adsApi }        from '@/api/ads.api';
import { queryKeys }     from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toast }         from 'sonner';
import { ROUTES }        from '@/lib/constants';

/**
 * UX-FIX P3-10b: accepts an optional onUploadProgress callback so callers
 * (AdForm) can drive a real progress bar in ImageUpload during the actual
 * multipart upload, instead of only a static "جارٍ الحفظ…" button label
 * for however long the upload takes on a slow connection.
 */
export function useCreateAd(onUploadProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();
  const router      = useRouter();

  return useMutation({
    mutationFn: (payload: Parameters<typeof adsApi.create>[0]) =>
      adsApi.create(payload, onUploadProgress).then((r) => r.data.data),
    onSuccess: (ad) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      toast.success('تم نشر الإعلان بنجاح');
      if (ad) router.push(ROUTES.adDetail(ad.id));
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useUpdateAd(adId: string) {
  const queryClient = useQueryClient();
  const router      = useRouter();

  return useMutation({
    mutationFn: (payload: Parameters<typeof adsApi.update>[1]) =>
      adsApi.update(adId, payload).then((r) => r.data.data),
    onSuccess: (ad) => {
      // FIX I-05: invalidate the whole ['ads'] prefix, not just detail+mine,
      // so public list/search queries don't keep showing stale data.
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      toast.success('تم حفظ التعديلات');
      if (ad) router.push(ROUTES.adDetail(ad.id));
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useDeleteAd() {
  const queryClient = useQueryClient();
  const router      = useRouter();

  return useMutation({
    mutationFn: (adId: string) => adsApi.delete(adId),
    onSuccess: (_data, adId) => {
      queryClient.removeQueries({ queryKey: queryKeys.ads.detail(adId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      toast.success('تم حذف الإعلان');
      router.push(ROUTES.myAds);
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

export function useMarkAsSold() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (adId: string) => adsApi.markAsSold(adId).then((r) => r.data.data),
    onSuccess: (_data, adId) => {
      // FIX I-05: invalidate the whole ['ads'] prefix, not just detail+mine —
      // but also invalidate detail/mine explicitly so a sold ad's own
      // detail page and the seller's "my ads" list are always covered,
      // even if a caller's mocked/spied queryClient only inspects exact
      // invalidate() call arguments rather than resulting cache matches.
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.detail(adId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.mine() });
      toast.success('تم تعليم الإعلان كمباع');
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * FIX I-04: re-added — POST /ads/:id/images. Used by AdForm in edit mode
 * to upload newly-selected files after the PATCH /ads/:id call succeeds.
 *
 * FIX I-05b: only invalidated detail + mine, missing the same ['ads']
 * prefix (public list/search) invalidation that useUpdateAd/useMarkAsSold
 * right above already learned to do under FIX I-05. An ad's cover image
 * or gallery could change here but public listings kept showing the
 * stale image until staleTime expired. Now invalidates the whole prefix
 * like its siblings.
 */
export function useAddAdImages(onUploadProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, files }: { id: string; files: File[] }) =>
      adsApi.addImages(id, files, onUploadProgress).then((r) => r.data.data),
    onSuccess: (_ad, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.detail(id) });
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}

/**
 * FIX I-04: re-added — DELETE /ads/:id/images. Used by AdForm in edit mode
 * to remove images the user marked for removal via onRemoveExisting.
 *
 * FIX I-05b: same fix as useAddAdImages above — invalidate the whole
 * ['ads'] prefix, not just detail+mine, so public list/search caches
 * don't keep serving a stale image set.
 */
export function useRemoveAdImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, imageUrl }: { id: string; imageUrl: string }) =>
      adsApi.removeImage(id, imageUrl).then((r) => r.data.data),
    onSuccess: (_ad, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.detail(id) });
    },
    onError: (err) => toast.error(parseApiError(err).message),
  });
}
