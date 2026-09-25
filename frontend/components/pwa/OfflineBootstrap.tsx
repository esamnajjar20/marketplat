/**
 * نقطة إقلاع نظام الـ Offline — تُركَّب مرة واحدة في AppProviders، بجانب
 * PwaBootstrap مباشرة (نفس ترتيب التركيب السابق، فقط بمكوّن منفصل).
 *
 * PLAN-runtime-separation (مرحلة 2/6): استُخرج بالكامل من PwaBootstrap.tsx —
 * queue replay + ad-draft sync + warming + مزامنة Push للمستخدم المسجَّل،
 * بنفس الكود ونفس السلوك تمامًا. هذا المكوّن (وكل ما يستدعيه) يعمل بلا أي
 * شرط بيئة تشغيل — نفس السلوك في Native/Browser/PWA، مطابقًا لمبدأ الخطة:
 * Offline يعمل في الثلاثة، وليس مرادفًا لأي منها.
 *
 * FIX OFFLINE-DRAFT-PUBLISH-01: بعد replay طابور SW يُستدعى
 * syncPendingOfflineDrafts لنشر المسودات التي لم تدخل الطابور.
 */
'use client';

import { useEffect } from 'react';
import { requestQueueReplay } from '@/lib/offlineQueue';
import { syncPendingOfflineDrafts } from '@/lib/offlineDraftPublisher';
import { toastDraftPublishResult } from '@/lib/offlinePublishFeedback';
import { initAdDraftSync } from '@/lib/offlineAdDraftSync';
import { warmCoreBundle } from '@/lib/offlineCoreBundle';
import { warmRouteShellsAtomic, warmPersonalShellsAtomic } from '@/lib/offlineRouteShells';
import { warmUserData } from '@/lib/offlineWarmingUserData';
import { ensurePushSubscriptionSynced } from '@/lib/pwa';
import { ensureNativePushSynced } from '@/lib/capacitor/nativePush';
import { supportsNativePush, supportsWebPush } from '@/lib/runtime/capabilities';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { WarmupIndicator } from './WarmupIndicator';
// T700 — listener for the SW's SW_TOKEN_REFRESHED broadcast (fires after
// the SW refreshes /auth/refresh on the page's behalf during a queue
// replay). Keeps the page's in-memory csrfToken in sync with the cookie
// the browser just stored — see lib/swTokenSync.ts for the full story.
import { initSwTokenSync } from '@/lib/swTokenSync';

let __offlineBootstrapInitialized = false;

/** SW replay ثم نشر المسودات المحلية — مسار مؤكد للرفع بعد عودة النت. */
function replayThenPublishDrafts(): void {
  void requestQueueReplay()
    .catch((err) => console.warn('[offline] requestQueueReplay failed:', err))
    .finally(() => {
      window.setTimeout(() => {
        void syncPendingOfflineDrafts({ includeFailed: true }).then((r) => {
          if (r.sent > 0 || r.failed > 0) {
            console.warn('[offline] published drafts from local store:', r);
            toastDraftPublishResult(r);
          }
        });
      }, 1500);
    });
}

export function OfflineBootstrap() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    if (!__offlineBootstrapInitialized) {
      __offlineBootstrapInitialized = true;
      initAdDraftSync();
      // T700 — installs a navigator.serviceWorker message listener that
      // mirrors SW-refreshed csrfTokens into useAuthStore. Same
      // one-time-install guard as the other initializers above; the
      // function is itself idempotent so a duplicate call is harmless.
      initSwTokenSync();
    }

    void warmCoreBundle();
    void warmRouteShellsAtomic();

    // mount: أعد إرسال الطابور + المسودات (لو فُتح التطبيق والنت متاح)
    replayThenPublishDrafts();

    const PERIODIC_QUEUE_MS = 5 * 60 * 1000;
    const periodicId = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        replayThenPublishDrafts();
      }
    }, PERIODIC_QUEUE_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        replayThenPublishDrafts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(periodicId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // FIX OFFLINE-QUEUE-RELIABILITY-01: مستمع online يجب أن يعمل دائمًا
  // (حتى قبل اكتمال auth hydration) وإلا طابور العمليات يبقى معلّقًا
  // إذا تأخر isAuthenticated أو كان false لحظيًا عند عودة النت.
  useEffect(() => {
    const onOnline = () => {
      replayThenPublishDrafts();
      void warmCoreBundle();
      void warmRouteShellsAtomic();
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void warmPersonalShellsAtomic();
    // PHASE-5 — user data warming. Gated to 'full' tier inside
    // warmUserData (2G/3G skip it — the ~55 KB payload would starve
    // page-shell warming).
    void warmUserData();
    void (async () => {
      if (await supportsWebPush()) {
        void ensurePushSubscriptionSynced();
      }
      if (await supportsNativePush()) {
        void ensureNativePushSynced();
      }
    })();

    const onOnlineAuth = () => {
      void warmPersonalShellsAtomic();
      void warmUserData();
      void (async () => {
        if (await supportsWebPush()) {
          void ensurePushSubscriptionSynced();
        }
        if (await supportsNativePush()) {
          void ensureNativePushSynced();
        }
      })();
    };
    window.addEventListener('online', onOnlineAuth);
    return () => window.removeEventListener('online', onOnlineAuth);
  }, [isAuthenticated]);

  return <WarmupIndicator />;
}
