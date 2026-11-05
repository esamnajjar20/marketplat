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
import { clearAllOfflineJson } from '@/lib/offlineJsonCache';
import { clearSavedPaymentMethods } from '@/lib/paymentStorage';
import { cancelAndClearQueryClient } from '@/lib/queryClient';
import { abortSessionRequests } from '@/lib/sessionRequestRegistry';
import { clearAppBadge } from '@/lib/appBadge';
import { clearRecentSearches } from '@/lib/recentSearches';
import { clearOfflineActivity } from '@/lib/offlineActivityLog';
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
  void unbindPushBindings();
}

/**
 * PUSH-LOGOUT-01: awaitable version. The server-side DELETE needs a valid
 * access token, but by the time clearSensitiveLocalData() runs the auth
 * store has already been cleared — so the request went out anonymous and
 * its failure was swallowed. useLogout/useLogoutAll now await this
 * BEFORE the session is torn down. Safe to call twice: the second call
 * finds no local subscription / stored token and does nothing.
 *
 * Never throws; capped at 3s so a dead network can't stall logout.
 */
export async function unbindPushBindings(): Promise<void> {
  const work = (async () => {
    try {
      const { unsubscribeFromPush } = await import('@/lib/pwa');
      await unsubscribeFromPush();
    } catch {
      /* web push unsupported or network failure — ignore */
    }
    try {
      // PUSH-TOKEN-STORAGE-01: same store nativePush.ts writes to
      // (secureStorage → Preferences on native). Reading localStorage
      // here never found the token on native builds.
      const { NATIVE_FCM_TOKEN_STORAGE_KEY, unregisterNativePush } = await import(
        '@/lib/capacitor/nativePush'
      );
      const { secureGet, secureRemove } = await import('@/lib/runtime/secureStorage');
      const token = await secureGet(NATIVE_FCM_TOKEN_STORAGE_KEY);
      if (token) {
        await unregisterNativePush(token);
        await secureRemove(NATIVE_FCM_TOKEN_STORAGE_KEY);
      }
    } catch {
      /* native path unavailable on plain web — ignore */
    }
  })();
  await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, 3000))]);
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

// Monotonic fence for asynchronous auth/bootstrap work. Any in-flight task
// captures the current version and must check it before committing results.
// Increment synchronously (before the first await) so logout/account-end wins
// even while the remaining storage cleanup is still running.
let sessionCleanupVersion = 0;

// ── PERF-AUTH-CLEANUP-SPLIT ─────────────────────────────────────────────
// The heavy store wipes live in lib/authCleanupStores.ts and are loaded on
// demand so they stay out of every route's first-load JS. A failed load
// (offline logout with an uncached chunk) must never skip the wipe silently:
// we retry once, then persist a flag that makes the next app start run it.
const PENDING_CLEANUP_KEY = 'marketplat:pending-store-cleanup';

type CleanupStage = 'clearAutoReadStage' | 'clearOfflineStoresStage';

function setPendingCleanupFlag(): void {
  try { localStorage.setItem(PENDING_CLEANUP_KEY, '1'); } catch { /* ignore */ }
}

async function runCleanupStage(stage: CleanupStage): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const mod = await import('@/lib/authCleanupStores');
      await mod[stage]();
      return;
    } catch (err) {
      if (attempt === 1) console.warn('[auth-cleanup] stage failed, scheduling retry:', stage, err);
    }
  }
  setPendingCleanupFlag();
}

/** Warm the stores chunk during idle time so an offline logout can still load it. */
export function preloadAuthCleanupStores(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  };
  const warm = () => { void import('@/lib/authCleanupStores').catch(() => undefined); };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(warm, { timeout: 8000 });
  else window.setTimeout(warm, 5000);
}

/**
 * Call once at app start (before the user can create new offline data). If a
 * previous logout could not wipe the heavy stores, finish the job now.
 */
export async function runPendingStoreCleanupIfNeeded(isAuthenticated: boolean): Promise<void> {
  // Never wipe while a session is active: the queue/drafts may already belong
  // to the NEW user. The flag stays set and the wipe runs on the next
  // signed-out start instead.
  if (isAuthenticated) return;
  let pending = false;
  try { pending = localStorage.getItem(PENDING_CLEANUP_KEY) === '1'; } catch { return; }
  if (!pending) return;
  try {
    const mod = await import('@/lib/authCleanupStores');
    await mod.clearAutoReadStage();
    await mod.clearOfflineStoresStage();
    try { localStorage.removeItem(PENDING_CLEANUP_KEY); } catch { /* ignore */ }
  } catch (err) {
    console.warn('[auth-cleanup] pending store cleanup still failing:', err);
  }
}


export function getSessionCleanupVersion(): number {
  return sessionCleanupVersion;
}

export async function clearSensitiveLocalData(): Promise<void> {
  sessionCleanupVersion += 1;
  // Abort network requests synchronously before clearing any user-scoped cache.
  abortSessionRequests();
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
    // Abort-aware queryFns receive TanStack's AbortSignal; cancel first so
    // active observers revert and their network work can stop before clear.
    await cancelAndClearQueryClient();
  } catch (err) {
    console.warn('[auth-cleanup] query cancellation/cache clear failed:', err);
  }
  try {
    const { clearOfflineQueryCache } = await import('@/lib/offlineQueryCache');
    await clearOfflineQueryCache();
  } catch (err) {
    console.warn('[auth-cleanup] offline query cache clear failed:', err);
  }
  // FIX LOGOUT-CACHE-DIRECT-01: awaited (was fire-and-forget).
  await clearServiceWorkerApiCache();
  await clearUnversionedOfflineBuckets();
  // نفس منطق clearServiceWorkerApiCache أعلاه: notifications-cache
  // مخزَّنة محليًا (localStorage) بلا ربط بهوية المستخدم — تنظيفها هنا
  // يمنع ظهور إشعارات المستخدم السابق على جهاز مشترك بعد تسجيل الدخول
  // بحساب آخر.
  clearNotificationsCache();
  // Offline activity can contain session-specific counts/messages; clear it
  // when the session changes so a shared device does not expose the prior
  // account's offline history after logout or account switch.
  clearOfflineActivity();
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
    await runCleanupStage('clearAutoReadStage');
  try {
    // Index for the 'market-saved-ads' bucket wiped above (must match
    // SAVED_INDEX_KEY in offlineSavedAds.ts / offlineSavedEntities.ts).
    localStorage.removeItem('saved-ads-offline');
  } catch {
    /* ignore */
  }
  clearAppBadge();
  clearAllOfflineLists();
  clearAllOfflineJson();
  // FIX PAYMENT-CLEAR-ON-LOGOUT: جهات دفع + بطاقات نت (بكلمات مرور
  // plaintext) كانت تبقى — User B يرى بيانات User A المالية.
  clearSavedPaymentMethods();
  // Heavy IndexedDB stores (drafts, queue, sales drafts, catalogs, messages,
  // media, warming state) — see lib/authCleanupStores.ts.
  await runCleanupStage('clearOfflineStoresStage');
  clearPushBindingsOnSessionEnd();
  // NATIVE-SESSION-01: drop non-secret session meta on native + web.
  void clearNativeSessionMeta();
}
