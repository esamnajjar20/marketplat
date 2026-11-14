/**
 * PERF-BUNDLE-PROVIDERS-01 — علامة "آخر حفظ لكاش الاستعلامات" بلا أي اعتماديات.
 * مفصولة عن lib/offlineQueryCache.ts (~23 KB مصدر) لأن مكوّنات الحزمة الأولى
 * (NetworkStatusBanner) تحتاج القراءة فقط؛ أما الاسترجاع/الحفظ فيُحمَّلان كسولًا
 * من AppProviders. offlineQueryCache.ts يعيد تصدير القارئ للتوافق.
 */
import { safeStorageGet } from '@/lib/browserStorage';

export const LAST_CACHE_AT_KEY = 'marketplat:offline-query-cache:last-saved-at';

export function getLastOfflineQueryCacheSavedAt(): number | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = safeStorageGet(LAST_CACHE_AT_KEY);
    if (!raw) return null;
    const value = Number(raw);
    // Ignore corrupt/future markers (clock changes or manually edited storage).
    return Number.isFinite(value) && value > 0 && value <= Date.now() + 60_000 ? value : null;
  } catch {
    // Storage can throw in privacy-restricted contexts; offline cache remains best-effort.
    return null;
  }
}
