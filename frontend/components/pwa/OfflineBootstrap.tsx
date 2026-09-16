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
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { WarmupIndicator } from './WarmupIndicator';

export function OfflineBootstrap() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    // FIX AD-DRAFT-QUEUE-LINK-01: يربط لاحقًا كل رسالة QUEUE_ITEM_* بمسودة
    // الإعلان المطابقة (operationId) — انظر lib/offlineAdDraftSync.ts.
    initAdDraftSync();

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
    void requestQueueReplay();

    // مزامنة دورية خفيفة أونلاين لطابور عالق (ليس بدل Background Sync)
    const PERIODIC_QUEUE_MS = 3 * 60 * 1000;
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

    // fallback لإعادة إرسال الطابور عند عودة الاتصال في المتصفحات التي لا
    // تدعم Background Sync (انظر تعليق requestQueueReplay).
    const handleOnline = () => {
      void requestQueueReplay();
      void warmCoreBundle();
      void warmRouteShells();
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.clearInterval(periodicId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // تسخين أشكال الصفحات المحمية (رسائل/إشعارات/لوحة…) لمستخدم مسجّل فقط.
  // PERSONAL_SHELL_CACHE يُمسَح عند تسجيل الخروج (CLEAR_API_CACHE).
  // مزامنة Web Push صامتة إن كان الإذن ممنوحًا مسبقًا (لا يطلب إذنًا جديدًا).
  useEffect(() => {
    if (!isAuthenticated) return;
    void warmPersonalShells();
    void ensurePushSubscriptionSynced();
    const onOnline = () => {
      void warmPersonalShells();
      void ensurePushSubscriptionSynced();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [isAuthenticated]);

  return <WarmupIndicator />;
}
