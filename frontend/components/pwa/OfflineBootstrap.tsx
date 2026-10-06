/**
 * نقطة إقلاع نظام الـ Offline — تُركَّب مرة واحدة في AppProviders.
 *
 * FIX WARM-PIPELINE-01: التسخين يمر عبر runWarmingPipeline (متسلسل) بدل
 * إطلاق core + shells + personal + userdata بالتوازي. عند online ينتظر
 * انتهاء replay الطابور قبل التسخين حتى لا تُسرق الباندويث من إرسال
 * الإعلانات/الرسائل المعلّقة.
 *
 * FIX WARM-SCHEDULE-01: "متى نسخّن" صار في offlineWarmingScheduler (دمج
 * المحفّزات، تأجيل لما بعد التحميل/idle، فقط والتبويب ظاهر، حد أدنى بين
 * التشغيلات، ونبضة كل 10 دقائق بدل مؤقّت 6 ساعات). كل مرحلة داخل الـ
 * pipeline لها نافذة طزاجة خاصة، فالنبضة رخيصة إن لم يكن هناك شيء قديم.
 */
'use client';

import { useEffect } from 'react';
import { requestQueueReplay } from '@/lib/offlineQueue';
import { syncPendingOfflineDrafts } from '@/lib/offlineDraftPublisher';
import { toastDraftPublishResult } from '@/lib/offlinePublishFeedback';
import { initAdDraftSync } from '@/lib/offlineAdDraftSync';
import { setQueueReplayInFlight } from '@/lib/offlineWarmingPipeline';
import { shouldAutoSyncNow } from '@/lib/offlineHubPrefs';
import { logOfflineActivity } from '@/lib/offlineActivityLog';
import {
  scheduleWarming,
  cancelScheduledWarming,
  TICK_MS,
} from '@/lib/offlineWarmingScheduler';
import { ensurePushSubscriptionSynced } from '@/lib/pwa';
import { ensureNativePushSynced } from '@/lib/capacitor/nativePush';
import { supportsNativePush, supportsWebPush } from '@/lib/runtime/capabilities';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { WarmupIndicator } from './WarmupIndicator';
import { initSwTokenSync } from '@/lib/swTokenSync';
import { initSalesOfflineSync, syncPendingSales } from '@/lib/sales-offline/salesSync';

let __offlineBootstrapInitialized = false;

// UNHANDLED-REJECTION-FIX-01: every fire-and-forget call below must
// end in .catch — `void promise` alone still lets a rejection escape
// to the global handler, which is what was reaching Sentry as
// "Unhandled promise rejection".
function safeFire(label: string, p: Promise<unknown>): void {
  void p.catch((err) => {
    console.warn('[offline] ' + label + ' failed:', err);
  });
}

/** SW replay ثم نشر المسودات — مع إعلام الـ pipeline أن الطابور مشغول. */
function replayThenPublishDrafts(): void {
  // PHASE-3: احترام إعداد «Wi‑Fi فقط» للمزامنة التلقائية
  if (!shouldAutoSyncNow()) {
    try {
      logOfflineActivity(
        'sync_skipped_wifi',
        'تأجيل المزامنة التلقائية — الاتصال ليس Wi‑Fi أو توفير البيانات مفعّل',
      );
    } catch {
      /* ignore */
    }
    return;
  }
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
              try {
                if (r.sent > 0) {
                  logOfflineActivity('sync_ok', `تم إرسال ${r.sent} مسودة/عملية`);
                }
                if (r.failed > 0) {
                  logOfflineActivity('sync_fail', `تعذّر إرسال ${r.failed}`);
                }
              } catch { /* ignore */ }
            }
          })
          .catch((err) => {
            console.warn('[offline] syncPendingOfflineDrafts failed:', err);
          })
          .finally(() => {
            void syncPendingSales(useAuthStore.getState().user?.id ?? null)
              .catch((err) => console.warn('[offline] sales sync failed:', err))
              .finally(() => setQueueReplayInFlight(false));
          });
      }, 1500);
    });
}

export function OfflineBootstrap() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    const stopSalesSyncListener = initSalesOfflineSync();
    if (!__offlineBootstrapInitialized) {
      __offlineBootstrapInitialized = true;
      initAdDraftSync();
      initSwTokenSync();
    }

    // Queue first (immediately — user's pending ad/message must not wait);
    // warming is scheduled, not fired: see offlineWarmingScheduler.
    replayThenPublishDrafts();
    scheduleWarming('mount', { authenticated: isAuthenticated });

    const PERIODIC_QUEUE_MS = 5 * 60 * 1000;
    const periodicId = window.setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        replayThenPublishDrafts();
      }
    }, PERIODIC_QUEUE_MS);

    // FIX WARM-TICK-01: replaces the 6h PERIODIC_WARM_MS timer. A cheap
    // 10-minute freshness tick while the app is open and visible; the
    // pipeline's per-phase freshness windows decide whether anything is
    // actually fetched (usually nothing). Keeps messages/notifications
    // minutes-fresh for a user who goes offline mid-session.
    const tickId = window.setInterval(() => {
      if (
        typeof navigator !== 'undefined' &&
        navigator.onLine &&
        document.visibilityState === 'visible'
      ) {
        scheduleWarming('tick', {
          authenticated: useAuthStore.getState().isAuthenticated,
        });
      }
    }, TICK_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        replayThenPublishDrafts();
        // A PWA resumed after hours in the background: timers were frozen,
        // so this is the moment to top up whatever went stale.
        scheduleWarming('visible', {
          authenticated: useAuthStore.getState().isAuthenticated,
        });
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // bfcache restore fires pageshow(persisted) without a reload/mount.
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) {
        scheduleWarming('visible', {
          authenticated: useAuthStore.getState().isAuthenticated,
        });
      }
    };
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      window.clearInterval(periodicId);
      window.clearInterval(tickId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handlePageShow);
      cancelScheduledWarming();
      stopSalesSyncListener();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only bootstrap
  }, []);

  useEffect(() => {
    const onOnline = () => {
      // Replay first; pipeline waits for setQueueReplayInFlight(false).
      replayThenPublishDrafts();
      scheduleWarming('online', {
        authenticated: useAuthStore.getState().isAuthenticated,
      });
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    // Auth just became true — personal + user-data phases. Merged with any
    // run already pending from mount (authenticated flag is OR-ed).
    scheduleWarming('auth', { authenticated: true });

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
