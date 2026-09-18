/**
 * نقطة إقلاع نظام الـ Offline — تُركَّب مرة واحدة في AppProviders، بجانب
 * PwaBootstrap مباشرة (نفس ترتيب التركيب السابق، فقط بمكوّن منفصل).
 *
 * PLAN-runtime-separation (مرحلة 2/6): استُخرج بالكامل من PwaBootstrap.tsx —
 * queue replay + ad-draft sync + warming + مزامنة Push للمستخدم المسجَّل،
 * بنفس الكود ونفس السلوك تمامًا. هذا المكوّن (وكل ما يستدعيه) يعمل بلا أي
 * شرط بيئة تشغيل — نفس السلوك في Native/Browser/PWA، مطابقًا لمبدأ الخطة:
 * Offline يعمل في الثلاثة، وليس مرادفًا لأي منها.
 */
'use client';

import { useEffect } from 'react';
import { requestQueueReplay } from '@/lib/offlineQueue';
import { initAdDraftSync } from '@/lib/offlineAdDraftSync';
import { warmCoreBundle } from '@/lib/offlineCoreBundle';
import { warmRouteShells, warmPersonalShells } from '@/lib/offlineRouteShells';
import { ensurePushSubscriptionSynced } from '@/lib/pwa';
import { ensureNativePushSynced } from '@/lib/capacitor/nativePush';
import { supportsNativePush, supportsWebPush } from '@/lib/runtime/capabilities';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { WarmupIndicator } from './WarmupIndicator';
import { initConflictResolver } from '@/lib/conflictResolver';

// FIX OFFLINE-INIT-ONCE: يمنع تنفيذ initAdDraftSync/initConflictResolver
// مرتين في React StrictMode (dev). في production، StrictMode غير مفعّل
// فلا يوجد double-mount، لكن الحماية مطلوبة لأن هذه الدوال تُضيف
// listeners على window/navigator.serviceWorker — إضافتها مرتين يعني
// معالجة كل رسالة SW مرتين (toast مكرر، إعادة محاولة مكررة).
let __offlineBootstrapInitialized = false;

export function OfflineBootstrap() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    // FIX AD-DRAFT-QUEUE-LINK-01: يربط لاحقًا كل رسالة QUEUE_ITEM_* بمسودة
    // الإعلان المطابقة (operationId) — انظر lib/offlineAdDraftSync.ts.
    if (!__offlineBootstrapInitialized) {
      __offlineBootstrapInitialized = true;
      initAdDraftSync();
      initConflictResolver();
    }

    // PHASE-1 (Offline Core Bundle) + PHASE-3-A (route shells): تحديث صامت
    // بالخلفية، محدود بمهلة WARM_INTERVAL_MS داخل warmCoreBundle نفسها فلا
    // يعيد الجلب بكل تحميل صفحة. warmRouteShells خفيف فلا داعي لنفس آلية
    // التقييد — يُعاد فقط عند فتح التطبيق/رجوع الاتصال، وهو idempotent.
    void warmCoreBundle();
    void warmRouteShells();

    // FIX OFFLINE-REPLAY-01: قبل هذا الإصلاح، إعادة إرسال الطابور تعتمد
    // حصرًا على حدث 'online' الحي (تحول فعلي offline→online والصفحة
    // مفتوحة وقتها) أو Background Sync (غير مدعوم إطلاقًا بـ Safari
    // iOS/macOS). لو المستخدم قفل التطبيق فعليًا وهو أوفلاين ثم فتحه
    // من جديد بعد ما رجع النت (أو التطبيق تعلّق بالخلفية على iOS
    // وعاد ظاهرًا بعد عودة الاتصال) — الصفحة تُحمَّل وهي أونلاين من
    // البداية، فحدث 'online' لا يُطلَق أبدًا، ولا Background Sync
    // متاح لجزء كبير من المستخدمين. النتيجة: عناصر الطابور تبقى
    // 'pending' للأبد بلا أي محاولة، رغم أن الاتصال عاد فعليًا —
    // بالضبط الشكوى: "العمليات تضل مخزّنة لما يجي النت". الحل: تحقّق
    // انتهازي عند كل تحميل/عودة ظهور للتطبيق، بغض النظر عن وجود حدث
    // تحول فعلي — requestQueueReplay() آمن حتى لو استُدعي وهو أوفلاين
    // فعليًا (fetch يفشل بصمت، العنصر يبقى pending، انظر replayOne's
    // 'still-offline' بـ sw.js).
    // FIX OFFLINE-LOGGING: catch للتشخيص — كان صامتًا تمامًا.
    requestQueueReplay().catch((err) =>
      console.warn('[offline] initial requestQueueReplay failed:', err),
    );

    // مزامنة دورية خفيفة أونلاين لطابور عالق (ليس بدل Background Sync)
    // FIX OFFLINE-PERIODIC-BATTERY: 5 دقائق بدل 3 — كل استدعاء يفتح SW
    // ويقرأ IndexedDB. على البطارية، 5 دقائق كافية لمعالجة أي طابور
    // عالق (المسارات الأخرى: online + visibilitychange + mount تلتقط
    // الحالات الفورية). iOS Safari يوقف setInterval عند الخمول أصلاً،
    // فالزيادة لا تضر التجربة.
    const PERIODIC_QUEUE_MS = 5 * 60 * 1000;
    const periodicId = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        void requestQueueReplay();
      }
    }, PERIODIC_QUEUE_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void requestQueueReplay();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // FIX OFFLINE-MERGE-ONLINE: online listener واحد في Effect 2 يغطي
    // كلا الاهتمامين (public + authenticated). هذا Effect يُنظّف فقط
    // الـ interval والـ visibility — لا يُسجّل online آخر.
    return () => {
      window.clearInterval(periodicId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // تسخين أشكال الصفحات المحمية (رسائل/إشعارات/لوحة…) لمستخدم مسجّل فقط.
  // PERSONAL_SHELL_CACHE يُمسَح عند تسجيل الخروج (CLEAR_API_CACHE).
  // مزامنة Push صامتة إن كان الإذن ممنوحًا مسبقًا (لا يطلب إذنًا جديدًا):
  //   Web/PWA → VAPID (ensurePushSubscriptionSynced)
  //   Native  → FCM   (ensureNativePushSynced)
  useEffect(() => {
    if (!isAuthenticated) return;
    void warmPersonalShells();
    void (async () => {
      if (await supportsWebPush()) {
        void ensurePushSubscriptionSynced();
      }
      if (await supportsNativePush()) {
        void ensureNativePushSynced();
      }
    })();
    // FIX OFFLINE-MERGE-ONLINE: listener واحد يغطي:
    //   - replay queue (public)
    //   - warm core/route shells (public)
    //   - warm personal shells (auth only)
    //   - push sync (auth only)
    // بدل listenerين متوازيين على window.
    const onOnline = () => {
      requestQueueReplay().catch((err) =>
        console.warn('[offline] replay on online failed:', err),
      );
      void warmCoreBundle();
      void warmRouteShells();
      if (!isAuthenticated) return;
      void warmPersonalShells();
      void (async () => {
        if (await supportsWebPush()) {
          void ensurePushSubscriptionSynced();
        }
        if (await supportsNativePush()) {
          void ensureNativePushSynced();
        }
      })();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [isAuthenticated]);

  return <WarmupIndicator />;
}
