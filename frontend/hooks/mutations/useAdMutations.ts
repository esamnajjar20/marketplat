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
import { useRef }        from 'react';
import { useRouter }     from 'next/navigation';
import { adsApi }        from '@/api/ads.api';
import { queryKeys }     from '@/lib/queryKeys';
import { parseApiError } from '@/lib/errorParser';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast }         from 'sonner';
import { ROUTES }        from '@/lib/constants';
import { saveAdDraft } from '@/lib/offlineAdDrafts';
import { compressImageForOffline } from '@/lib/imageOffline';
import { newOfflineOperationId } from '@/lib/offlineOperationId';
import {
  getActiveOfflineDraftId,
  clearActiveOfflineDraftId,
} from '@/lib/offlineDraftResume';
import { useAuthStore, selectUser } from '@/store/auth.store';

/**
 * FIX IMAGEOFFLINE-WIRE-01: يضغط أفضل جهد ممكن — صورة واحدة تفشل (ملف
 * غير صورة، بيئة بلا Canvas) لا توقف البقية ولا تمنع حفظ المسودة نفسها؛
 * فقط تُستبعَد من المعاينة. النشر الفعلي بجودة كاملة غير متأثر إطلاقًا،
 * لأنه يمر بطابور الـ SW لا بهذا المسار.
 */
async function bestEffortCompressPreviews(
  files: File[],
): Promise<{ name: string; blob: Blob }[]> {
  const results = await Promise.allSettled(
    files.slice(0, 4).map(async (f) => ({ name: f.name, blob: await compressImageForOffline(f) })),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<{ name: string; blob: Blob }> => r.status === 'fulfilled')
    .map((r) => r.value);
}

/**
 * UX-FIX P3-10b: accepts an optional onUploadProgress callback so callers
 * (AdForm) can drive a real progress bar in ImageUpload during the actual
 * multipart upload, instead of only a static "جارٍ الحفظ…" button label
 * for however long the upload takes on a slow connection.
 */
export function useCreateAd(onUploadProgress?: (percent: number) => void) {
  const queryClient = useQueryClient();
  const router      = useRouter();
  const userId      = useAuthStore(selectUser)?.id ?? null;
  // FIX AD-DRAFT-QUEUE-LINK-01: نفس operationId يُرسَل كـ header مع
  // الطلب (فيخزّنه sw.js مع عنصر الطابور لو قُوِّد) ويُحفَظ مع المسودة
  // بالأسفل — بدونه لا توجد طريقة لاحقة لمعرفة أنهما نفس المحاولة.
  // ref لا state: يُنشأ فقط لحظة استدعاء mutationFn نفسه، لا يحتاج
  // re-render، وonError بنفس الاستدعاء يقرأه بأمان (لا نداءات متزامنة من
  // نفس نموذج الإعلان الواحد).
  const operationIdRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: (payload: Parameters<typeof adsApi.create>[0]) => {
      operationIdRef.current = newOfflineOperationId();
      return adsApi.create(payload, onUploadProgress, operationIdRef.current).then((r) => r.data.data);
    },
    onSuccess: (ad) => {
      clearActiveOfflineDraftId();
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      toast.success('تم نشر الإعلان بنجاح', {
        description: 'شاركه مع معارفك لزيادة المشاهدات. يمكنك تعديله لاحقاً من «إعلاناتي».',
        duration: 5000,
      });
      if (ad) router.push(`${ROUTES.adDetail(ad.id)}?published=1`);
    },
    onError: async (err, payload) => {
      const parsed = parseApiError(err);
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false;
      // FIX FALSE-OFFLINE-DRAFT-01: مسودة + «محفوظ محليًا» فقط عند أوفلاين حقيقي.
      // سابقًا offline || parsed.queued كانت تُظهر الرسالة والجهاز أونلاين.
      if (offline) {
        try {
          const files = (payload as { images?: File[] }).images ?? [];
          // FIX IMAGEOFFLINE-WIRE-01: أفضل جهد — لا يوقف حفظ المسودة لو
          // فشل الضغط (بيئة بلا Canvas، ملف غير صورة، إلخ).
          const images = files.length > 0 ? await bestEffortCompressPreviews(files) : [];
          await saveAdDraft({
            id: getActiveOfflineDraftId() ?? undefined,
            mode: 'create',
            kind: 'ad',
            payload: {
              title: String((payload as { title?: string })?.title ?? ''),
              description: String((payload as { description?: string })?.description ?? ''),
              price: (payload as { price?: string | number }).price ?? null,
              categoryId: (payload as { categoryId?: string }).categoryId ?? null,
              city: (payload as { city?: string }).city ?? null,
              condition: (payload as { condition?: string }).condition ?? null,
              isNegotiable: Boolean((payload as { isNegotiable?: boolean }).isNegotiable),
              imageLabels: files.map((f) => f.name),
            },
            status: 'pending_sync',
            operationId: operationIdRef.current,
            userId,
            images,
          });
          // FIX IMAGEOFFLINE-WIRE-01 (كان FIX OFFLINE-IMAGES-NOT-DRAFTED-01):
          // المسودة الآن تحمل معاينة مضغوطة للصور (لو الضغط نجح) —
          // لكنها للعرض فقط بمركز المزامنة. الصور الفعلية بجودتها الكاملة
          // محفوظة ومضمونة عبر طابور الـ SW نفسه (نفس الطلب الأصلي بصوره
          // — انظر FIX OFFLINE-ADS-01 بـ public/sw.js) اللي هيرسلها تلقائيًا
          // عند عودة الاتصال، بغض النظر عن نجاح الضغط هنا أو فشله.
          toast.message('محفوظ محليًا — بانتظار الاتصال', {
            description:
              'سيُرسل تلقائيًا مع الصور عند عودة الاتصال. يمكنك متابعة الحالة من الإعدادات → المزامنة.',
          });
          return;
        } catch {
          /* fall through */
        }
      }
      toast.error(parsed.message);
    },
  });
}

export function useUpdateAd(adId: string) {
  const queryClient = useQueryClient();
  const router      = useRouter();
  const userId      = useAuthStore(selectUser)?.id ?? null;
  const operationIdRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: (payload: Parameters<typeof adsApi.update>[1]) => {
      operationIdRef.current = newOfflineOperationId();
      return adsApi.update(adId, payload, operationIdRef.current).then((r) => r.data.data);
    },
    onSuccess: (ad) => {
      clearActiveOfflineDraftId();
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      toast.success('تم حفظ التعديلات');
      if (ad) router.push(ROUTES.adDetail(ad.id));
    },
    onError: async (err, payload) => {
      const parsed = parseApiError(err);
      const offline =
        typeof navigator !== 'undefined' && navigator.onLine === false;
      if (offline) {
        try {
          await saveAdDraft({
            id: getActiveOfflineDraftId() ?? undefined,
            mode: 'edit',
            kind: 'ad',
            remoteAdId: adId,
            payload: {
              title: String((payload as { title?: string })?.title ?? ''),
              description: String((payload as { description?: string })?.description ?? ''),
              price: (payload as { price?: string | number }).price ?? null,
              categoryId: (payload as { categoryId?: string }).categoryId ?? null,
              city: (payload as { city?: string }).city ?? null,
              // FIX AD-DRAFT-FIELDS-01: condition + isNegotiable كانت تُفقد
              // عند الاستئناف من مركز المزامنة بعد تعديل أوفلاين.
              condition: (payload as { condition?: string }).condition ?? null,
              isNegotiable: Boolean((payload as { isNegotiable?: boolean }).isNegotiable),
            },
            status: 'pending_sync',
            operationId: operationIdRef.current,
            userId,
          });
          toast.message('التعديل محفوظ محليًا — بانتظار الاتصال', {
            description: 'سيُرسل تلقائيًا عند عودة الاتصال. الإعدادات → المزامنة.',
          });
          return;
        } catch {
          /* fall through */
        }
      }
      toast.error(parsed.message);
    },
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
    onError: toastMutationError,
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
    onError: toastMutationError,
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
    onError: toastMutationError,
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
    onError: toastMutationError,
  });
}

/**
 * Gap #11 — PUT /ads/:id/images/reorder. Used by AdForm's edit mode to
 * persist a drag-and-drop reorder of existingImages. No toast on
 * success (the drag interaction itself is the feedback); onError still
 * toasts so a failed reorder (e.g. IMAGES_MISMATCH from a stale list)
 * is visible.
 */
export function useReorderAdImages() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, images }: { id: string; images: string[] }) =>
      adsApi.reorderImages(id, images).then((r) => r.data.data),
    onSuccess: (_ad, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.detail(id) });
    },
    onError: toastMutationError,
  });
}
