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
import { warmRouteShells, warmPersonalShells } from '@/lib/offlineRouteShells';
import { ensurePushSubscriptionSynced } from '@/lib/pwa';
import { ensureNativePushSynced } from '@/lib/capacitor/nativePush';
import { supportsNativePush, supportsWebPush } from '@/lib/runtime/capabilities';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { WarmupIndicator } from './WarmupIndicator';
import { initConflictResolver } from '@/lib/conflictResolver';

let __offlineBootstrapInitialized = false;

/** SW replay ثم نشر المسودات المحلية — مسار مؤكد للرفع بعد عودة النت. */
function replayThenPublishDrafts(): void {
  void requestQueueReplay()
    .catch((err) => console.warn('[offline] requestQueueReplay failed:', err))
    .finally(() => {
      window.setTimeout(() => {
        void syncPendingOfflineDrafts({ includeFailed: true }).then((r) => {
          if (r.sent > 0 || r.failed > 0) {
            console.info('[offline] published drafts from local store:', r);
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
      initConflictResolver();
    }

    void warmCoreBundle();
    void warmRouteShells();

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

    const onOnline = () => {
      replayThenPublishDrafts();
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
