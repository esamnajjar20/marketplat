/**
 * سياسة كاش MarketPlat — مصدر واحد لحدود البيانات المحلية.
 *
 * القاعدة: الكاش يسرّع ويعطي offline، والسيرفر يبقى مصدر الحقيقة أونلاين.
 *
 * راجع: docs/OFFLINE_CACHE_ARCHITECTURE.md
 *
 * أرقام IMAGE/API في public/sw.js يجب أن تبقى متوافقة عند التغيير
 * (SW لا يستورد هذا الملف — انسخ القيم يدويًا هناك).
 */

import { CACHE_POLICY } from '@/lib/cachePolicy';

/**
 * FIX OFFLINE-CACHE-SCOPE-HELPER-01: whitelist-based check for "is this
 * the unfiltered first page?" — the condition every offline list cache
 * write in this project should gate on.
 *
 * History: six separate hooks (useAds, useMyAppointments, useMyActivity,
 * useProducts, useNotifications, useAdsForHome) each hand-rolled the
 * guard as a blacklist of the filter fields they knew about at the time:
 *
 *   const isBaseBrowse =
 *     (!params?.page || params.page === 1) &&
 *     !params?.city && !params?.categoryId && ...;
 *
 * Every one of them had the same failure mode — a filter field added
 * to the query type later was not added to the blacklist, so the
 * filtered result set was silently written into the shared offline
 * slot, and a later unfiltered offline open served only that subset
 * back. Fixing them one by one (ADS-OFFLINE-CACHE-SCOPE-01/02/03,
 * APPT-, ACTIVITY-, PRODUCTS-, NOTIFICATIONS-) worked but did not
 * change the class of bug: the next hook will make the same mistake
 * for the same reason (a filter not on the list is invisible).
 *
 * This helper inverts the logic: a caller declares which fields are
 * pagination-only (default: page + limit), and everything else counts
 * as a filter. Adding a new filter field to a query type requires no
 * change here — the new field is a filter by default, which is the
 * safe direction to fail.
 *
 * Sort fields (sortBy / sortOrder) are NOT filters — they reorder the
 * same result set, so a caller that wants them excluded should pass
 * them via the optional `nonFilterFields` argument. The same applies
 * to any other non-filter field the caller knows about.
 */
export function isUnfilteredFirstPage<T extends object>(
  params: T | undefined,
  options: {
    /** Keys that do not disqualify the request from the generic slot.
     *  Should include page + limit (the default) and, for callers that
     *  want them, sortBy / sortOrder. */
    nonFilterFields?: ReadonlyArray<keyof T>;
  } = {},
): boolean {
  if (!params) return true;

  const nonFilter = new Set<keyof T>([
    'page' as keyof T,
    'limit' as keyof T,
    ...(options.nonFilterFields ?? []),
  ]);

  // Non-first page → never the base slot.
  const page = (params as { page?: number }).page;
  if (page !== undefined && page !== 1) return false;

  // Any field other than the declared non-filter ones, that is present
  // and non-empty, disqualifies.
  for (const key of Object.keys(params) as Array<keyof T>) {
    if (nonFilter.has(key)) continue;
    const v = params[key];
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return false;
  }

  return true;
}

/** حدود قوائم البيانات المحلية (localStorage / offlineListCache). */
export const OFFLINE_DATA_LIMITS = CACHE_POLICY.storage.offlineLists;

/** حدود Cache Storage (معلوماتية — التنفيذ في sw.js). */
export const SW_CACHE_LIMITS = {
  apiEntries: CACHE_POLICY.storage.serviceWorker.apiEntries,
  imageEntries: CACHE_POLICY.storage.serviceWorker.imageEntries,
  savedAdsEntries: CACHE_POLICY.storage.serviceWorker.savedAdsEntries,
  staticEntries: CACHE_POLICY.storage.serviceWorker.staticEntries,
  personalShellEntries: CACHE_POLICY.storage.serviceWorker.personalShellEntries,
} as const;

/** أسماء كاشات مُصدَّرة (غير مرتبطة بإصدار) vs مُصدَّرة. */
export const UNVERSIONED_CACHES = [
  'market-saved-ads',
  // FIX AUTO-READ-CACHE-PRESERVE: نفس سياسة market-saved-ads — بدون
  // إصدار، يُحفظ عبر كل SW update.
  'market-auto-read-ads',
] as const;

export const VERSIONED_CACHE_PREFIXES = [
  'market-static-',
  'market-core-',
  'market-personal-shell-',
  'market-images-',
  'market-api-',
] as const;
