/**
 * FIX OFFLINE-DRAFT-PUBLISH-01: مسار احتياطي مؤكد لنشر المسودات عند عودة النت.
 *
 * المشكلة السابقة: الاعتماد الكلي على اعتراض Service Worker لطلب multipart
 * cross-origin. إن لم يدخل الطلب طابور SW (SW غير مفعّل، أو فشل الحفظ)،
 * تبقى المسودة "بانتظار الرفع" إلى الأبد بلا رفع فعلي.
 *
 * الحل: عند الحفظ أوفلاين نخزّن publishFiles (الصور الأصلية) مع المسودة.
 * عند online / مزامنة يدوية:
 *   1) requestQueueReplay() يعالج ما يملكه SW
 *   2) هذه الدالة تنشر أي مسودة pending_sync/failed ما زالت معلّقة
 *      وليست موجودة في طابور SW (تجنّب إرسال مزدوج)
 *
 * يغطي: إعلان / منتج / خدمة / طلب مفتوح (open-request).
 */
import { getActiveSW } from '@/lib/swReady';
import { useAuthStore } from '@/store/auth.store';
import { adsApi } from '@/api/ads.api';
import { productsApi } from '@/api/products.api';
import { serviceListingsApi } from '@/api/service-listings.api';
import { requestsApi, type CreateRequestBody } from '@/api/requests.api';
import {
  listAdDrafts,
  deleteAdDraft,
  saveAdDraft,
  publishFilesToFiles,
  type AdDraft,
} from '@/lib/offlineAdDrafts';
import { listQueuedOperationsWithAge } from '@/lib/offlineQueue';
import { parseApiError } from '@/lib/errorParser';
import { isNetworkLikeFailure } from '@/lib/isNetworkLikeFailure';
import type { CreateAdPayload } from '@/types/ad.types';
import type { CreateProductPayload, UpdateProductPayload } from '@/types/product.types';
import type {
  CreateServiceListingPayload,
  UpdateServiceListingPayload,
  ServicePricingType,
  ServiceLocationType,
} from '@/types/service.types';
import type { RequestType } from '@/types/request.types';

const MAX_AUTO_RETRIES = 5;

/**
 * FIX STALE-QUEUE-HANDOFF-01: if an operationId has been sitting in
 * the SW queue longer than this, the Publisher stops waiting on it
 * and sends from the local draft instead. 60s is comfortably longer
 * than the SW's own QUEUE_RETRY_MIN_GAP_MS (30s), so a normal retry
 * gets at least one shot before we take over, but short enough that
 * a user whose queued entry is genuinely stuck sees progress within
 * a minute of hitting مزامنة الآن rather than never.
 */
// FIX QUEUE-HANDOFF-SAFETY-01: reverted from a brief 15s experiment.
// The SW's own QUEUE_RETRY_MIN_GAP_MS is 30s — a 15s handoff could fire
// between the SW's first and second retry attempts, so the Publisher
// would send the same operationId while the SW still had the entry in
// its queue, and once the SW retried (from 30s onward) it would re-send
// the same request → duplicate ad/product/service on the server. 60s
// guarantees the SW has at least one full retry gap (30s) plus margin
// to either succeed or give up before the Publisher takes over. Users
// hitting مزامنة الآن with a genuinely stuck entry wait one extra
// minute; users in the normal case (SW healthy) never hit this path at
// all, because the SW clears the entry within seconds.
const STALE_QUEUE_HANDOFF_MS = 60_000;

export type DraftPublishResult = {
  sent: number;
  failed: number;
  skipped: number;
};

let syncInFlight: Promise<DraftPublishResult> | null = null;

function num(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v);
}

async function publishOne(draft: AdDraft): Promise<'sent' | 'failed' | 'skipped'> {
  const kind = draft.kind ?? 'ad';
  const opId = draft.operationId ?? undefined;
  const files = draft.publishFiles?.length
    ? await publishFilesToFiles(draft.publishFiles)
    : [];

  try {
    if (draft.mode === 'create') {
      if (kind === 'ad') {
        const storeIdRaw = draft.payload.storeId;
        const storeId =
          typeof storeIdRaw === 'string' && storeIdRaw.trim()
            ? storeIdRaw.trim()
            : undefined;
        const payload: CreateAdPayload = {
          title: str(draft.payload.title),
          description: str(draft.payload.description),
          city: str(draft.payload.city) || 'غير محدد',
          price: num(draft.payload.price),
          isNegotiable: Boolean(draft.payload.isNegotiable),
          condition: (draft.payload.condition as CreateAdPayload['condition']) || undefined,
          categoryId: draft.payload.categoryId ? str(draft.payload.categoryId) : undefined,
          latitude: num(draft.payload.latitude),
          longitude: num(draft.payload.longitude),
          images: files.length ? files : undefined,
          // FIX OFFLINE-STORE-AD-01: إعادة نشر باسم المتجر عند وجود storeId
          ...(storeId ? { storeId } : {}),
        };
        await adsApi.create(payload, undefined, opId);
      } else if (kind === 'product') {
        const payload: CreateProductPayload = {
          categoryId: str(draft.payload.categoryId),
          name: str(draft.payload.name || draft.payload.title),
          description: str(draft.payload.description),
          price: num(draft.payload.price) ?? 0,
          discountPrice: num(draft.payload.discountPrice),
          wholesalePrice: num(draft.payload.wholesalePrice),
          wholesaleMinQty: num(draft.payload.wholesaleMinQty),
          availability: draft.payload.availability as CreateProductPayload['availability'],
          stockQuantity: num(draft.payload.stockQuantity),
          images: files,
        };
        await productsApi.create(payload, undefined, opId);
      } else if (kind === 'service') {
        const payload: CreateServiceListingPayload = {
          serviceTypeId: str(draft.payload.serviceTypeId),
          categoryId: str(draft.payload.categoryId),
          title: str(draft.payload.title),
          description: str(draft.payload.description),
          pricingType: (draft.payload.pricingType as ServicePricingType) || 'NEGOTIABLE',
          price: num(draft.payload.price),
          durationEstimate: draft.payload.durationEstimate
            ? str(draft.payload.durationEstimate)
            : undefined,
          attributes: draft.payload.attributes && typeof draft.payload.attributes === 'object' && !Array.isArray(draft.payload.attributes)
            ? draft.payload.attributes as Record<string, unknown>
            : undefined,
          serviceLocation:
            (draft.payload.serviceLocation as ServiceLocationType) || 'AT_PROVIDER',
          images: files,
        };
        await serviceListingsApi.create(payload, undefined, opId);
      } else if (kind === 'open-request') {
        const body: CreateRequestBody = {
          type: (draft.payload.type as RequestType) || 'SERVICE',
          categoryId: str(draft.payload.categoryId),
          title: str(draft.payload.title),
          description: str(draft.payload.description),
          city: draft.payload.city ? str(draft.payload.city) : undefined,
          budgetMin: num(draft.payload.budgetMin),
          budgetMax: num(draft.payload.budgetMax),
        };
        // FIX REQ-OPID-01: same operationId that useCreateRequest
        // attaches to the header — needed so that when the SW has
        // already queued this exact request, the check against
        // listQueuedOperationIds() below actually matches and skips
        // this re-send.
        // FIX REQ-IMAGE-OFFLINE-01: mirror useCreateRequest's own
        // flow — upload the preserved File[]s first, then create with
        // the resulting URLs. Both steps happen inside this try{}, so
        // a network hiccup here is caught by the surrounding catch and
        // the draft stays in 'failed' with a fresh retryCount — no
        // silent data loss.
        await requestsApi.createWithImages(body, files.length ? files : undefined, opId);
      } else {
        // kind غير معروف — لا مسار API تلقائي هنا بعد
        return 'skipped';
      }
    } else {
      // edit — JSON بدون صور (الصور عبر endpoints منفصلة)
      const remoteId = draft.remoteAdId;
      if (!remoteId) return 'skipped';

      if (kind === 'ad') {
        await adsApi.update(
          remoteId,
          {
            title: str(draft.payload.title) || undefined,
            description: str(draft.payload.description) || undefined,
            price: num(draft.payload.price),
            isNegotiable:
              draft.payload.isNegotiable !== undefined
                ? Boolean(draft.payload.isNegotiable)
                : undefined,
            condition: (draft.payload.condition as CreateAdPayload['condition']) || undefined,
            city: draft.payload.city ? str(draft.payload.city) : undefined,
            categoryId: draft.payload.categoryId
              ? str(draft.payload.categoryId)
              : undefined,
          },
          opId,
        );
      } else if (kind === 'product') {
        const payload: UpdateProductPayload = {
          categoryId: draft.payload.categoryId
            ? str(draft.payload.categoryId)
            : undefined,
          name: str(draft.payload.name || draft.payload.title) || undefined,
          description: str(draft.payload.description) || undefined,
          price: num(draft.payload.price),
          discountPrice: num(draft.payload.discountPrice) ?? null,
          wholesalePrice: num(draft.payload.wholesalePrice) ?? null,
          wholesaleMinQty: num(draft.payload.wholesaleMinQty) ?? null,
          availability: draft.payload.availability as UpdateProductPayload['availability'],
          stockQuantity: num(draft.payload.stockQuantity) ?? null,
          status: draft.payload.status as UpdateProductPayload['status'],
        };
        await productsApi.update(remoteId, payload, opId);
      } else if (kind === 'service') {
        const payload: UpdateServiceListingPayload = {
          categoryId: draft.payload.categoryId
            ? str(draft.payload.categoryId)
            : undefined,
          title: str(draft.payload.title) || undefined,
          description: str(draft.payload.description) || undefined,
          pricingType: draft.payload.pricingType as ServicePricingType | undefined,
          price: num(draft.payload.price),
          durationEstimate: draft.payload.durationEstimate
            ? str(draft.payload.durationEstimate)
            : undefined,
          serviceLocation: draft.payload.serviceLocation as
            | ServiceLocationType
            | undefined,
        };
        await serviceListingsApi.update(remoteId, payload, opId);
      } else {
        return 'skipped';
      }
    }

    await deleteAdDraft(draft.id);
    return 'sent';
  } catch (err) {
    const parsed = parseApiError(err);
    // FIX DRAFT-PUBLISH-PERMANENT-4XX: distinguish permanent failures
    // from transient ones. A 4xx that isn't 408/429 means the server
    // actively rejected the payload (validation error, business rule,
    // forbidden) — retrying it four more times just burns quota and
    // leaves the user staring at "جاري المحاولة" forever. Marking it
    // permanent (publishRetryCount = MAX_AUTO_RETRIES) puts it in the
    // terminal 'failed' state immediately, so the sync-center UI shows
    // "راجع البيانات" instead of pretending the retry will eventually
    // succeed. Real transient failures (statusCode 0 = no response,
    // 5xx, 408 timeout, 429 rate limit) still get the full retry
    // budget.
    const is4xx = parsed.statusCode >= 400 && parsed.statusCode < 500;
    const isTransient4xx = parsed.statusCode === 408 || parsed.statusCode === 429;
    const permanent = is4xx && !isTransient4xx && !isNetworkLikeFailure(parsed);
    const retries = permanent
      ? MAX_AUTO_RETRIES
      : (draft.publishRetryCount ?? 0) + 1;
    await saveAdDraft({
      id: draft.id,
      mode: draft.mode,
      kind: draft.kind,
      remoteAdId: draft.remoteAdId,
      payload: draft.payload,
      status: 'failed',
      lastError: permanent
        ? `فشل دائم (${parsed.statusCode}): ${parsed.message}`
        : parsed.message,
      // FIX LASTERROR-CODE-01: same rationale as the mutation hooks —
      // store the code so the sync center shows current Arabic wording
      // instead of the (possibly stale) string above.
      lastErrorCode: parsed.code,
      lastErrorStatus: parsed.statusCode,
      operationId: draft.operationId,
      userId: draft.userId,
      images: draft.images,
      publishFiles: draft.publishFiles,
      publishRetryCount: retries,
    });
    // FIX PERMANENT-4XX-CLEAR-QUEUE: a permanent 4xx means the server
    // has definitively rejected this operation — retrying (via SW or
    // via the Publisher) is pointless. If the SW still has an entry
    // for this operationId, ask it to drop it, or the sync center will
    // keep counting the same dead operation as "in queue" forever and
    // every sync tick will keep re-attempting it. Kept best-effort:
    // if the SW is unreachable (dev, extension), the draft's own
    // failed+retries state still surfaces the problem to the user.
    if (permanent && draft.operationId) {
      try {
        const reg = await getActiveSW();
        reg?.active?.postMessage({
          type: 'DISCARD_QUEUE_ITEM_BY_OP_ID',
          operationId: draft.operationId,
        });
      } catch {
        /* SW unavailable — draft remains, user sees it in the list */
      }
    }
    console.warn(
      '[draft-publisher] publish failed:',
      draft.id,
      parsed.message,
      permanent ? '(permanent — queue entry discarded)' : `(retry ${retries}/${MAX_AUTO_RETRIES})`,
    );
    return 'failed';
  }
}

/**
 * ينشر المسودات المعلّقة التي لا يملكها طابور الـ SW حاليًا.
 * آمن للاستدعاء المتكرر (mutex داخلي).
 */
export async function syncPendingOfflineDrafts(options?: {
  userId?: string | null;
  /** إن true: يعيد محاولة failed أيضًا (زر «مزامنة الآن»). الافتراضي: pending_sync فقط + failed تحت سقف المحاولات */
  includeFailed?: boolean;
}): Promise<DraftPublishResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { sent: 0, failed: 0, skipped: 0 };
  }
  if (syncInFlight) return syncInFlight;

  syncInFlight = (async () => {
    const result: DraftPublishResult = { sent: 0, failed: 0, skipped: 0 };
    try {
      // T690 — resolve the userId to filter by. The explicit option wins;
      // otherwise default to the CURRENT logged-in user. This is a
      // security boundary, not a convenience:
      //
      // clearDraftOnlyAdDrafts() (authCleanup.ts) deliberately keeps
      // pending_sync/failed drafts across logout — losing an in-flight
      // ad the user already composed is worse than keeping a row around.
      // But the consequence is that a draft created by User A survives
      // User A closing the browser without logging out, and is still in
      // IndexedDB when User B logs in on the same shared device.
      //
      // Before this fix, all three call sites (OfflineBootstrap,
      // /offline page, SyncCenterClient) passed NO userId, so
      // listAdDrafts(undefined) returned EVERY draft in IndexedDB — and
      // publishOne sent them with whatever Bearer token was on the
      // request. Result: User B's sync published User A's pending ads /
      // products / service listings / open requests under User B's
      // account, with User A's images and content.
      //
      // Now: explicit override still wins for callers that already
      // know the user (SyncCenterClient may pass one), and everything
      // else filters to the current store user. If there is no
      // logged-in user at all, bail out — publishing requires the
      // owner's Bearer token, so syncing for a guest is meaningless
      // (and would send an unauthorized request if any drafts existed
      // with userId: null from an older schema).
      const effectiveUserId =
        options?.userId !== undefined
          ? options.userId
          : useAuthStore.getState().user?.id ?? null;

      if (effectiveUserId === null) {
        return result;
      }

      const drafts = await listAdDrafts(effectiveUserId);
      const queueOpAges = await listQueuedOperationsWithAge();
      const includeFailed = options?.includeFailed !== false;

      const candidates = drafts.filter((d) => {
        if (d.status === 'pending_sync') return true;
        if (d.status === 'failed' && includeFailed) {
          return !d.publishFilesIncomplete && (d.publishRetryCount ?? 0) < MAX_AUTO_RETRIES;
        }
        return false;
      });

      const now = Date.now();
      for (const draft of candidates) {
        // FIX STALE-QUEUE-HANDOFF-01: an entry the SW is actively
        // retrying is fine to skip — the SW will deliver it. But an
        // entry the SW has been sitting on for over a minute is
        // effectively stuck (weak-network retries exhausted, or a
        // deployment where the SW never actually intercepted it) —
        // at that point waiting on the SW forever means the draft
        // stays 'pending_sync' forever. Take over.
        if (draft.operationId) {
          const queuedAt = queueOpAges.get(draft.operationId);
          if (queuedAt !== undefined && now - queuedAt < STALE_QUEUE_HANDOFF_MS) {
            result.skipped += 1;
            continue;
          }
          // Otherwise: fall through and send from the draft.
        }

        // Never publish if local storage skipped any selected attachment; otherwise the listing
        // would silently lose photos. Image-free products/services remain valid.
        if (draft.publishFilesIncomplete) {
          try {
            await saveAdDraft({
              ...draft,
              status: 'failed',
              lastError: 'لم تُحفظ كل المرفقات على الجهاز بسبب حدود الحجم. افتح المسودة وأعد إرفاق الصور الناقصة قبل النشر.',
            });
          } catch (e) { console.warn('[draft-publisher] mark incomplete attachments failed:', e); }
          result.failed += 1;
          continue;
        }

        const outcome = await publishOne(draft);
        if (outcome === 'sent') result.sent += 1;
        else if (outcome === 'failed') result.failed += 1;
        else result.skipped += 1;
      }
    } catch (err) {
      console.warn('[draft-publisher] syncPendingOfflineDrafts failed:', err);
    }
    return result;
  })();

  try {
    return await syncInFlight;
  } finally {
    syncInFlight = null;
  }
}
