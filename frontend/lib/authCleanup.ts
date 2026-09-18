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
import { clearOfflineMessagesStore } from '@/lib/offlineMessagesStore';
import { clearAppBadge } from '@/lib/appBadge';

/** يطلب من الـ SW مسح كاش API + PERSONAL_SHELL — نفس بروتوكول
 * CLEAR_API_CACHE الموجود أصلًا بـ public/sw.js (SECURITY FIX audit #2 +
 * FIX PWA-NOTIF-01). منقولة هنا من hooks/mutations/useAuthMutations.ts
 * (لا تزال معاد تصديرها من هناك لتوافق الاستيرادات القديمة) لأنها ليست
 * hook — دالة تصفح عادية يصح استدعاؤها من أي سياق تنظيف. */
export function clearServiceWorkerApiCache() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'CLEAR_API_CACHE' });
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

export function clearSensitiveLocalData(): void {
  clearServiceWorkerApiCache();
  // نفس منطق clearServiceWorkerApiCache أعلاه: notifications-cache
  // مخزَّنة محليًا (localStorage) بلا ربط بهوية المستخدم — تنظيفها هنا
  // يمنع ظهور إشعارات المستخدم السابق على جهاز مشترك بعد تسجيل الدخول
  // بحساب آخر.
  clearNotificationsCache();
  clearAppBadge();
  clearAllOfflineLists();
  void clearDraftOnlyAdDrafts();
  clearAllOfflineJson();
  // FIX QUEUE-CLEAR-ON-LOGOUT: طابور الـ SW يحتوي عناصر User A (مع توكنه
  // في Authorization headers) — بدونه، User B يرى عدد العمليات المعلّقة.
  void clearOfflineQueue();
  // FIX CATALOG-CLEAR-ON-LOGOUT: سجل تنزيلات كتالوجات المتاجر + أجسامها
  // في IndexedDB كانت تبقى عبر logout — User B يرى ما نزّله User A.
  clearCatalogDownloads();
  // FIX PAYMENT-CLEAR-ON-LOGOUT: جهات دفع + بطاقات نت (بكلمات مرور
  // plaintext) كانت تبقى — User B يرى بيانات User A المالية.
  clearSavedPaymentMethods();
  void clearOfflineMessagesStore();
  clearPushBindingsOnSessionEnd();
}
