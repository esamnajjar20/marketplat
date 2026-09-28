/**
 * FIX AUTH-CLEANUP-CENTRALIZE-01: قبل هذا الملف، كل مسار ينهي الجلسة
 * محليًا (logout / logout-all / تغيير كلمة المرور) كان يكرّر — أو يفترض
 * أنه يكرّر — نفس قائمة نداءات التنظيف يدويًا. useChangePassword كان
 * تعليقه يقول حرفيًا "Mirrors useLogout/useLogoutAll's local-session
 * cleanup" بينما تنفيذه الفعلي يستدعي 3 فقط من أصل 8 خطوات — انحراف
 * توثيقي/سلوكي حقيقي، لا نية. دالة واحدة هنا تمنع هذا الانحراف مستقبلًا:
 * أي مسار جديد ينهي جلسة يستدعيها بدل إعادة كتابة القائمة.
 *
 * ملاحظة أمنية مقصودة: هذه الدالة تمسح فقط بيانات "نسخة/كاش" (يُعاد
 * جلبها من السيرفر بلا خسارة) — نسخة الإشعارات، قوائم الأوفلاين العامة،
 * كاش الـ SW، محادثات ورسائل IndexedDB. لا تمسح مسودات الإعلانات بحالة
 * pending_sync/failed (عمليات إرسال فعلية لم تُحسم بعد) — انظر
 * lib/offlineAdDrafts.ts's clearDraftOnlyAdDrafts لتفاصيل هذا القرار
 * (FIX AD-DRAFT-LOGOUT-DATALOSS-01). هذا يعني: نعم، تغيير كلمة المرور
 * الآن يمسح كاشات أكثر مما كان يمسح سابقًا (توحيدًا مع الخروج) — قرار
 * أمني متعمَّد لأن تغيير كلمة المرور بالتعريف "لا أثق بهذه الجلسة على
 * هذا الجهاز بعد الآن"، لكنه لن يُفقد أي إعلان لم يُرسَل بعد لنفس السبب
 * الذي يحمي منه الخروج العادي.
 */

import { clearNotificationsCache } from '@/lib/notificationsCache';
import { clearAllOfflineLists } from '@/lib/offlineListCache';
import { clearDraftOnlyAdDrafts } from '@/lib/offlineAdDrafts';
import { clearAllOfflineJson } from '@/lib/offlineJsonCache';
import { clearOfflineQueue } from '@/lib/offlineQueue';
import { clearCatalogDownloads } from '@/lib/downloadStorage';
import { clearSavedPaymentMethods } from '@/lib/paymentStorage';
import { getQueryClient } from '@/lib/queryClient';
import { clearOfflineMessagesStore } from '@/lib/offlineMessagesStore';
import { clearAppBadge } from '@/lib/appBadge';
import { clearRecentSearches } from '@/lib/recentSearches';
import { clearAutoReadCache } from '@/lib/offlineAutoRead';
import { clearPersonalWarmingState } from '@/lib/offlineWarmingState';
import { clearNativeSessionMeta } from '@/lib/capacitor/nativeSessionStorage';

/** يطلب من الـ SW مسح كاش API + PERSONAL_SHELL — نفس بروتوكول
 * CLEAR_API_CACHE الموجود أصلًا بـ public/sw.js (SECURITY FIX audit #2 +
 * FIX PWA-NOTIF-01). منقولة هنا من hooks/mutations/useAuthMutations.ts
 * (لا تزال معاد تصديرها من هناك لتوافق الاستيرادات القديمة) لأنها ليست
 * hook — دالة تصفح عادية يصح استدعاؤها من أي سياق تنظيف. */
export async function clearServiceWorkerApiCache(): Promise<void> {
  // Ask the SW (if it controls this page) — keeps its in-memory state honest.
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_API_CACHE' });
  } catch {
    /* ignore */
  }

  // FIX LOGOUT-CACHE-DIRECT-01: postMessage alone is not a guarantee — after a
  // hard reload (Shift+Reload) the page has NO controller, so the message was
  // silently dropped and the previous user's cached API responses / personal
  // shells stayed on disk. Cache Storage is reachable from the page itself,
  // so delete the user-scoped buckets directly and WAIT for it.
  // Prefix-matching also covers buckets left behind by older SW versions.
  if (typeof caches === 'undefined') return;
  try {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(
          (n) =>
            n.startsWith('market-api-') ||
            n.startsWith('market-personal-shell-') ||
            n.startsWith('market-user-data-'),
        )
        .map((n) => caches.delete(n)),
    );
  } catch (err) {
    console.warn('[auth-cleanup] direct cache wipe failed:', err);
  }
}

/**
 * كل بيانات "الكاش/النسخة المحلية" المرتبطة بجلسة المستخدم الحالي —
 * لا تمسح مسودات إعلانات معلّقة فعليًا (pending_sync/failed)، فقط
 * status:'draft' النقية غير المرتبطة بأي محاولة إرسال.
 */
/**
 * Best-effort: drop this device's push bindings from the server and local
 * storage when the session ends. Fire-and-forget — never blocks logout UI.
 * Web: unsubscribeFromPush (VAPID). Native: DELETE fcm-tokens + clear stored token.
 */
function clearPushBindingsOnSessionEnd(): void {
  void (async () => {
    try {
      const { unsubscribeFromPush } = await import('@/lib/pwa');
      await unsubscribeFromPush();
    } catch {
      /* web push unsupported or network failure — ignore */
    }
    try {
      const { NATIVE_FCM_TOKEN_STORAGE_KEY, unregisterNativePush } = await import(
        '@/lib/capacitor/nativePush'
      );
      const token =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem(NATIVE_FCM_TOKEN_STORAGE_KEY)
          : null;
      if (token) {
        await unregisterNativePush(token);
        localStorage.removeItem(NATIVE_FCM_TOKEN_STORAGE_KEY);
      }
    } catch {
      /* native path unavailable on plain web — ignore */
    }
  })();
}

/**
 * FIX QUEUE-AWAIT-ON-LOGOUT-01: async so callers can await IndexedDB
 * queue wipe before navigation. Previously void clearOfflineQueue() was
 * fire-and-forget — closing the tab mid-logout could leave User A's
 * queued mutations (URLs + bodies) visible until the promise settled.
 */
/**
 * Unversioned buckets: not user-scoped and never removed by SW upgrades, so
 * they would show User A's saved/visited ads to User B on a shared device.
 * Only wiped on real session end / account switch — NOT on a same-user login.
 */
async function clearUnversionedOfflineBuckets(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    await Promise.all([
      caches.delete('market-saved-ads'),
      caches.delete('market-auto-read-ads'),
    ]);
  } catch (err) {
    console.warn('[auth-cleanup] unversioned bucket wipe failed:', err);
  }
}

export async function clearSensitiveLocalData(): Promise<void> {
  // FIX REFRESH-QUEUE-LOGOUT: reject any requests currently parked in
  // api/client.ts's refresh queue. Their retry would ship the revoked
  // access token to the server, get another 401, and re-enter the
  // refresh flow against a refresh cookie this same cleanup is about
  // to delete — surfacing a "session expired" toast and a hard
  // redirect to /login for a user who just clicked Logout.
  //
  // Dynamic import rather than a top-level one: api/client.ts already
  // imports clearSensitiveLocalData from this module at top level, so
  // a direct import here would be circular. By the time this function
  // is ever called, both modules are fully initialised, so the
  // dynamic import resolves synchronously from the module cache.
  void import('@/api/client').then(({ invalidateRefreshSession }) => {
    invalidateRefreshSession();
  }).catch(() => { /* client not loaded — no queue to clear */ });

  // FIX AUTH-CLEAR-QUERY-CACHE: كان TanStack Query cache يبقى بعد logout
  // — User B يرى ['auth', 'me'], ['favorites', 'list'], ['notifications']
  // وغيرها من User A. استخدام clear() (وليس invalidate) — لأن
  // invalidation يُبقي البيانات القديمة كـ placeholder بينما يُحدّث.
  try {
    getQueryClient().clear();
  } catch (err) {
    console.warn('[auth-cleanup] queryClient.clear() failed:', err);
  }
  // FIX LOGOUT-CACHE-DIRECT-01: awaited (was fire-and-forget).
  await clearServiceWorkerApiCache();
  await clearUnversionedOfflineBuckets();
  // نفس منطق clearServiceWorkerApiCache أعلاه: notifications-cache
  // مخزَّنة محليًا (localStorage) بلا ربط بهوية المستخدم — تنظيفها هنا
  // يمنع ظهور إشعارات المستخدم السابق على جهاز مشترك بعد تسجيل الدخول
  // بحساب آخر.
  clearNotificationsCache();
  // FIX AUTH-CLEAR-RECENT-SEARCHES-01: recentSearches.ts stores
  // the user's history in its own localStorage key
  // ('marketplat:recent-searches-v2'), which clearAllOfflineLists()
  // does NOT cover — that only walks OFFLINE_LIST_KEYS from
  // offlineListCache.ts. On a shared device, User B saw User A's
  // search history on their first SearchBox focus until they
  // clicked the manual clear button (SearchBox.tsx:134). Clearing
  // here puts it in the same session-cleanup path as every other
  // user-scoped local cache.
    clearRecentSearches();
    // SW-CLEAR-GPS-ON-LOGOUT-01: useLocationResolver persists the last
    // GPS fix in localStorage under 'location:gps' with a 24-hour TTL,
    // and nothing cleared it on logout. On a shared device, User A's
    // location would be shown as User B's default location for up to a
    // day (24h TTL), or until B pressed the "استخدام موقعي" CTA and
    // overwrote it. Removed here so the next session starts with no
    // location until the new user explicitly asks for one.
    //
    // Directly manipulating the key rather than importing the hook —
    // the key is a stable string contract (useLocationResolver exports
    // STORAGE_KEY? no — the constant is module-private on purpose,
    // since it's not meant to be read from outside). Using the string
    // here is intentional and documented; a future change to the key
    // must update this line as well.
    try {
      localStorage.removeItem('location:gps');
    } catch {
      // localStorage may throw in private mode / when full
    }
    // FIX AUTOREAD-CLEAR-ON-LOGOUT-01: auto-read index
    // (localStorage 'marketplat:auto-read-ads') + its Cache Storage
    // bucket ('market-auto-read-ads') hold every visited ad id + title
    // + API response + thumbnail, with NO user scoping. AdDetail.tsx
    // calls autoSaveVisitedAd for every viewer (guests included), and
    // EmptySearchSuggestions renders listAutoReadAds() under
    // "شوهد مؤخرًا". On a shared device User B saw User A's browsing
    // history the moment a search returned zero results. Fire-and-forget
    // because the Cache Storage half is async and logout UX shouldn't
    // block on it.
    void clearAutoReadCache();
  try {
    // Index for the 'market-saved-ads' bucket wiped above (must match
    // SAVED_INDEX_KEY in offlineSavedAds.ts / offlineSavedEntities.ts).
    localStorage.removeItem('saved-ads-offline');
  } catch {
    /* ignore */
  }
  clearAppBadge();
  clearAllOfflineLists();
  void clearDraftOnlyAdDrafts();
  clearAllOfflineJson();
  // FIX QUEUE-CLEAR-ON-LOGOUT + FIX QUEUE-AWAIT-ON-LOGOUT-01:
  // طابور الـ SW كان يخزّن عناصر User A (وربما Authorization قبل
  // QUEUE-NO-STORE-AUTH-01). ننتظر المسح حتى لا تبقى عناصر بعد التوجيه.
  try {
    await clearOfflineQueue();
  } catch (err) {
    console.warn('[auth-cleanup] clearOfflineQueue failed:', err);
  }
  // FIX CATALOG-CLEAR-ON-LOGOUT: سجل تنزيلات كتالوجات المتاجر + أجسامها
  // في IndexedDB كانت تبقى عبر logout — User B يرى ما نزّله User A.
  clearCatalogDownloads();
  // FIX PAYMENT-CLEAR-ON-LOGOUT: جهات دفع + بطاقات نت (بكلمات مرور
  // plaintext) كانت تبقى — User B يرى بيانات User A المالية.
  clearSavedPaymentMethods();
  void clearOfflineMessagesStore();
  // FIX SW-CLEAR-PERSONAL-WARMING-01: without this, the IndexedDB
  // warming snapshot would still say every personal route was complete
  // on the next login, so warming would skip them all and the personal
  // shell cache would stay empty right after login (when offline
  // coverage is most needed).
  void clearPersonalWarmingState();
  clearPushBindingsOnSessionEnd();
  // NATIVE-SESSION-01: drop non-secret session meta on native + web.
  void clearNativeSessionMeta();
}
