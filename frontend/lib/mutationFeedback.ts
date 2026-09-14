/**
 * lib/mutationFeedback.ts
 *
 * FIX OFFLINE-QUEUED-TOAST-01: every mutation hook across ads, products,
 * service listings, service broadcasts, store management, and
 * service-provider management used the exact same
 * `onError: (err) => toast.error(parseApiError(err).message)` pattern.
 * client.ts's response interceptor (FIX QUEUE-UX-01) already turns the
 * SW's honest 202 {queued:true} response into a rejection whose
 * `.message` is the correct "queued, will retry" Arabic text — so the
 * *content* shown was never wrong. But every one of those 50+ call
 * sites rendered it via `toast.error`, i.e. the same red/alarm styling
 * as a real failure. Practically: a store owner who marks a product's
 * stock, pins an ad, or submits a service quote while offline saw a
 * scary red toast for an action that actually succeeded (queued
 * locally, will send itself once back online) — indistinguishable at a
 * glance from "this broke." Only useCreateAd/useUpdateAd (which also
 * save a locally-recoverable draft, see lib/offlineAdDrafts.ts) already
 * special-cased `parsed.queued` before this fix.
 *
 * This is the single shared fix point: swap the mechanical
 * `onError: (err) => toast.error(parseApiError(err).message)` for
 * `onError: toastMutationError` and every mutation gets the correct
 * calm/neutral toast for a queued offline action, and the normal red
 * error toast for everything else — with zero per-hook logic.
 *
 * Deliberately NOT applied to useCreateAd/useUpdateAd (their onError
 * already does more: saves a recoverable local draft with preview
 * images before showing feedback — replacing that would be a
 * regression, not a fix) or to admin/moderation mutations
 * (useAdminMutations) — silently queuing a destructive admin action for
 * automatic replay minutes or hours later, once the admin is no longer
 * looking at the context that justified it, is a product decision this
 * fix does not make unilaterally.
 */
import { toast } from 'sonner';
import { parseApiError } from '@/lib/errorParser';

export function toastMutationError(err: unknown): void {
  const parsed = parseApiError(err);
  const offline =
    typeof navigator !== 'undefined' && navigator.onLine === false;
  // FIX FALSE-OFFLINE-DRAFT-01: رسالة الطابور الهادئة فقط والجهاز أوفلاين.
  // لو SW قديم رجّع queued وأنت أونلاين، نعرض خطأ عادي بدل «محفوظ محليًا».
  if (parsed.queued && offline) {
    // Neutral/info toast, not the red error one — this "error" is the
    // SW's offline queue confirming it safely captured the request, not
    // a failure. See FIX QUEUE-UX-01 (client.ts) for where `.queued`
    // and this exact `.message` text come from.
    toast.message(parsed.message, {
      description: 'يمكنك متابعة حالته من الإعدادات ← المزامنة.',
    });
    return;
  }
  toast.error(parsed.message);
}
