/**
 * نقطة إقلاع نظام الـ Offline — تُركَّب مرة واحدة في AppProviders.
 *
 * FIX WARM-PIPELINE-01: التسخين يمر عبر runWarmingPipeline (متسلسل) بدل
 * إطلاق core + shells + personal + userdata بالتوازي. عند online ينتظر
 * انتهاء replay الطابور قبل التسخين حتى لا تُسرق الباندويث من إرسال
 * الإعلانات/الرسائل المعلّقة.
 */
'use client';

import { useEffect } from 'react';
import { requestQueueReplay } from '@/lib/offlineQueue';
import { syncPendingOfflineDrafts } from '@/lib/offlineDraftPublisher';
import { toastDraftPublishResult } from '@/lib/offlinePublishFeedback';
import { initAdDraftSync } from '@/lib/offlineAdDraftSync';
import {
  runWarmingPipeline,
  setQueueReplayInFlight,
} from '@/lib/offlineWarmingPipeline';
import { ensurePushSubscriptionSynced } from '@/lib/pwa';
import { ensureNativePushSynced } from '@/lib/capacitor/nativePush';
import { supportsNativePush, supportsWebPush } from '@/lib/runtime/capabilities';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { WarmupIndicator } from './WarmupIndicator';
import { initSwTokenSync } from '@/lib/swTokenSync';

let __offlineBootstrapInitialized = false;

// UNHANDLED-REJECTION-FIX-01: every fire-and-forget call below must
// end in .catch — `void promise` alone still lets a rejection escape
// to the global handler, which is what was reaching Sentry as
// "Unhandled promise rejection". This wrapper centralises the catch
// so a single point needs updating if the pipeline's contract changes.
function safeRunWarming(opts: Parameters<typeof runWarmingPipeline>[0]): void {
  void runWarmingPipeline(opts).catch((err) => {
    console.warn('[offline] runWarmingPipeline failed:', err);
  });
}

function safeFire(label: string, p: Promise<unknown>): void {
  void p.catch((err) => {
    console.warn('[offline] ' + label + ' failed:', err);
  });
}

/** SW replay ثم نشر المسودات — مع إعلام الـ pipeline أن الطابور مشغول. */
function replayThenPublishDrafts(): void {
  setQueueReplayInFlight(true);
  void requestQueueReplay()
    .catch((err) => console.warn('[offline] requestQueueReplay failed:', err))
    .finally(() => {
      window.setTimeout(() => {
        // SYNC-DRAFT-CATCH-01: this chain had only .then / .finally —
        // a rejection from syncPendingOfflineDrafts escaped to the
        // global handler, which is what reached Sentry as "Unhandled
        // promise rejection".
        void syncPendingOfflineDrafts({ includeFailed: true })
          .then((r) => {
            if (r.sent > 0 || r.failed > 0) {
              console.warn('[offline] published drafts from local store:', r);
              toastDraftPublishResult(r);
            }
          })
          .catch((err) => {
            console.warn('[offline] syncPendingOfflineDrafts failed:', err);
          })
          .finally(() => {
            setQueueReplayInFlight(false);
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
      initSwTokenSync();
    }

    // Queue first, then warming pipeline (pipeline waits if replay still active).
    replayThenPublishDrafts();
    safeRunWarming({ authenticated: isAuthenticated });

    const PERIODIC_QUEUE_MS = 5 * 60 * 1000;
    const periodicId = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        replayThenPublishDrafts();
      }
    }, PERIODIC_QUEUE_MS);

    // PERIODIC-WARM-6H-01: top-up once every 6 hours. The user drives
    // warming manually from /settings/offline; this timer exists so a
    // long-running session still picks up new content without the user
    // having to think about it. Fires only when online.
    const PERIODIC_WARM_MS = 6 * 60 * 60 * 1000;
    const warmId = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        safeRunWarming({
          authenticated: useAuthStore.getState().isAuthenticated,
          skipQueueWait: true,
        });
      }
    }, PERIODIC_WARM_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        replayThenPublishDrafts();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(periodicId);
      window.clearInterval(warmId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  useEffect(() => {
    const onOnline = () => {
      // Replay first; pipeline waits for setQueueReplayInFlight(false).
      replayThenPublishDrafts();
      safeRunWarming({
        authenticated: useAuthStore.getState().isAuthenticated,
      });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Auth just became true — run personal + user-data phases via pipeline.
    safeRunWarming({ authenticated: true });

    void (async () => {
      if (await supportsWebPush()) {
        safeFire('ensurePushSubscriptionSynced', ensurePushSubscriptionSynced());
      }
      if (await supportsNativePush()) {
        safeFire('ensureNativePushSynced', ensureNativePushSynced());
      }
    })().catch((err) => {
      console.warn('[offline] push sync IIFE failed:', err);
    });
  }, [isAuthenticated]);

  return <WarmupIndicator />;
}
