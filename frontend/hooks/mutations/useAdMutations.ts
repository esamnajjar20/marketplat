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
import { isNetworkLikeFailure } from '@/lib/isNetworkLikeFailure';
import { toastMutationError } from '@/lib/mutationFeedback';
import { toast }         from 'sonner';
import { ROUTES }        from '@/lib/constants';
import { saveAdDraft, filesToPublishFiles } from '@/lib/offlineAdDrafts';
import { toastOfflineSaved, toastSoftNetworkDraft } from '@/lib/offlinePublishFeedback';
import { bestEffortCompressPublish, bestEffortCompressPreviews } from '@/lib/imageOfflineHelpers';
import { newOfflineOperationId } from '@/lib/offlineOperationId';
import {
  getActiveOfflineDraftId,
  clearActiveOfflineDraftId,
} from '@/lib/offlineDraftResume';
import { useAuthStore, selectUser } from '@/store/auth.store';


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
      // FIX TRIPLE-COMPRESS-01: removed the compressImageForPublish call
      // that briefly lived here. It was documented as "so the queued
      // SW request stays under the 6MB cap", but the Service Worker
      // never actually sees this request — it's a cross-origin POST to
      // the backend, so the SW's fetch handler never runs for it. The
      // call was pure dead weight: on every offline submit it burned
      // 3-9s of CPU compressing images that then went nowhere, before
      // the fast-fail interceptor rejected the request and handed
      // control to onError. Compression now happens exactly once,
      // inside onError, where its output is actually used.
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
      // FIX FALSE-OFFLINE-DRAFT-01 + ONLINE-SILENT-DRAFT-01:
      // أوفلاين → مسودة + رسالة انتظار النت.
      // أونلاين + فشل شبكة → مسودة status failed بلا ادعاء انقطاع نت.
      // 400/403/… → خطأ فقط، بلا مسودة شبكة.
      //
      // FIX MUTATION-SOFT-OFFLINE-01 (تابع): بعد أن صار sw.js's
      // handleMutation يُقيِّد الطلب بالطابور حتى لو navigator.onLine
      // كان true (fetch فشل فعليًا رغم ذلك)، الرد يرجع بنفس شكل
      // {queued:true} — parsed.queued يلتقطه بغض النظر عن `offline`
      // هنا. لو اعتمدنا `offline` وحدها لتصنيف الحالة كان الطلب
      // سيُحفَظ محليًا بحالة 'failed' (يوحي بإعادة إرسال يدوية) رغم أن
      // sw.js أصلًا قيّده وسيُرسله تلقائيًا — ازدواج إرسال محتمل لو
      // المستخدم أعاد الإرسال يدويًا من المسودة. `parsed.queued` يغطي
      // هذه الحالة أيضًا.
      if (offline || isNetworkLikeFailure(parsed)) {
        try {
          const files = (payload as { images?: File[] }).images ?? [];
          // DRAFT-DEBUG-01 (temporary)
          console.log('[draft-debug] files:', files.length,
            files.map((x) => ({ n: x?.name, s: x?.size, t: x?.type })));
          // FIX TRIPLE-COMPRESS-01: compress ONCE, reuse the result for
          // both the tiny previews (images) and the full publish payload
          // (publishFiles). Previously previews and publishFiles each
          // ran their own compression pass over the same File[]s — on a
          // phone with a few 8-12MB photos that's 6-18 seconds of extra
          // canvas work per offline submit, which is exactly what made
          // the form appear frozen at "جاري رفع الصور... 0%" (it wasn't
          // uploading; it was re-compressing the same bytes twice).
          const compressedFiles =
            files.length > 0 ? await bestEffortCompressPublish(files) : [];
          const images =
            compressedFiles.length > 0
              ? await bestEffortCompressPreviews(compressedFiles)
              : [];
          console.log('[draft-debug] compressed:', compressedFiles.length,
            'previews:', images.length, 'userId:', userId);
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
              // FIX OFFLINE-STORE-AD-01: حفظ متجر النشر أوفلاين
              storeId: (payload as { storeId?: string }).storeId ?? null,
              imageLabels: files.map((f) => f.name),
            },
            status: (offline || parsed.queued) ? 'pending_sync' : 'failed',
            lastError: (offline || parsed.queued) ? undefined : parsed.message,
            // FIX LASTERROR-CODE-01: store the machine-readable
            // code + status so the sync center re-translates the
            // message on every render — a frozen Arabic string
            // keeps showing old wording after any i18n update
            // (this is why 'لا تملك صلاحية' kept appearing even
            // after STORE_NOT_ACTIVE was added).
            lastErrorCode: (offline || parsed.queued) ? undefined : parsed.code,
            lastErrorStatus: (offline || parsed.queued) ? undefined : parsed.statusCode,
            operationId: operationIdRef.current,
            userId,
            images,
            // FIX OFFLINE-DRAFT-PUBLISH-01: حفظ الصور الأصلية لإعادة النشر
            // من المسودة لو طابور الـ SW لم يعترض الطلب.
            publishFiles: compressedFiles.length
              ? await filesToPublishFiles(compressedFiles)
              : undefined,
            publishRetryCount: 0,
          });
          console.log('[draft-debug] saveAdDraft OK');
          if (offline || parsed.queued) {
            toastOfflineSaved({
              entity: 'الإعلان',
              mode: 'create',
              queuedBySw: Boolean(parsed.queued) && !offline,
            });
          } else {
            toastSoftNetworkDraft({ mode: 'create' });
          }
          return;
        } catch (e) {
          console.error('[draft-debug] FAILED:', e);
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
      if (offline || isNetworkLikeFailure(parsed)) {
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
              condition: (payload as { condition?: string }).condition ?? null,
              isNegotiable: Boolean((payload as { isNegotiable?: boolean }).isNegotiable),
            },
            status: (offline || parsed.queued) ? 'pending_sync' : 'failed',
            lastError: (offline || parsed.queued) ? undefined : parsed.message,
            // FIX LASTERROR-CODE-01: store the machine-readable
            // code + status so the sync center re-translates the
            // message on every render — a frozen Arabic string
            // keeps showing old wording after any i18n update
            // (this is why 'لا تملك صلاحية' kept appearing even
            // after STORE_NOT_ACTIVE was added).
            lastErrorCode: (offline || parsed.queued) ? undefined : parsed.code,
            lastErrorStatus: (offline || parsed.queued) ? undefined : parsed.statusCode,
            operationId: operationIdRef.current,
            userId,
          });
          if (offline || parsed.queued) {
            toastOfflineSaved({
              entity: 'الإعلان',
              mode: 'edit',
              queuedBySw: Boolean(parsed.queued) && !offline,
            });
          } else {
            toastSoftNetworkDraft({ mode: 'edit' });
          }
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

  return useMutation({
    mutationFn: (adId: string) => adsApi.delete(adId),
    onSuccess: (_data, adId) => {
      queryClient.removeQueries({ queryKey: queryKeys.ads.detail(adId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.ads.mine() });
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
