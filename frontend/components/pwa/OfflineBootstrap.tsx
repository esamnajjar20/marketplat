/**
 * نقطة إقلاع نظام الـ Offline — تُركَّب مرة واحدة في AppProviders.
 *
 * LOAD-SPEED-01: التسخين (core / routes / personal / user-data) مؤجَّل
 * بعد أول رسم عبر scheduleAfterPaint حتى لا يسرق bandwidth من
 * /auth/refresh وطلبات الصفحة الحالية. الطابور يبقى فوريًا (بيانات
 * المستخدم المعلّقة أهم من prefetch).
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
import { initConflictResolver } from '@/lib/conflictResolver';
import { initSwTokenSync } from '@/lib/swTokenSync';
import { scheduleAfterPaint } from '@/lib/scheduleIdle';

let __offlineBootstrapInitialized = false;

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

/** تسخين خفيف: core bundle ثم shells العامة — بعد idle. */
function scheduleBackgroundWarming(): () => void {
  const cancelCore = scheduleAfterPaint(
    () => {
      void warmCoreBundle();
    },
    { timeoutMs: 1500, delayMs: 0 },
  );
  const cancelRoutes = scheduleAfterPaint(
    () => {
      void warmRouteShellsAtomic();
    },
    { timeoutMs: 3000, delayMs: 400 },
  );
  return () => {
    cancelCore();
    cancelRoutes();
  };
}

async function syncPushBindings(): Promise<void> {
  if (await supportsWebPush()) {
    void ensurePushSubscriptionSynced();
  }
  if (await supportsNativePush()) {
    void ensureNativePushSynced();
  }
}

export function OfflineBootstrap() {
  const isAuthenticated = useAuthStore(selectIsAuthenticated);

  useEffect(() => {
    if (!__offlineBootstrapInitialized) {
      __offlineBootstrapInitialized = true;
      initAdDraftSync();
      initConflictResolver();
      initSwTokenSync();
    }

    // فوري: إعادة إرسال الطابور (لا يؤجَّل — تجربة المستخدم)
    replayThenPublishDrafts();

    // مؤجَّل: تسخين لا ينافس الرسم الأول
    const cancelWarm = scheduleBackgroundWarming();

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
      cancelWarm();
      window.clearInterval(periodicId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let cancelOnlineWarm: (() => void) | null = null;

    const onOnline = () => {
      replayThenPublishDrafts();
      cancelOnlineWarm?.();
      cancelOnlineWarm = scheduleBackgroundWarming();
    };

    window.addEventListener('online', onOnline);

    return () => {
      cancelOnlineWarm?.();
      window.removeEventListener('online', onOnline);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Personal shells بعد رسم الصفحة المحمية — لا مع /auth/refresh
    const cancelPersonal = scheduleAfterPaint(
      () => {
        void warmPersonalShellsAtomic();
      },
      { timeoutMs: 2500, delayMs: 600 },
    );
    // بيانات المستخدم أثقل — أبعد قليلًا
    const cancelUserData = scheduleAfterPaint(
      () => {
        void warmUserData();
      },
      { timeoutMs: 5000, delayMs: 1200 },
    );
    const cancelPush = scheduleAfterPaint(
      () => {
        void syncPushBindings();
      },
      { timeoutMs: 6000, delayMs: 2000 },
    );

    const onOnlineAuth = () => {
      void warmPersonalShellsAtomic();
      void warmUserData();
      void syncPushBindings();
    };
    window.addEventListener('online', onOnlineAuth);

    return () => {
      cancelPersonal();
      cancelUserData();
      cancelPush();
      window.removeEventListener('online', onOnlineAuth);
    };
  }, [isAuthenticated]);

  return <WarmupIndicator />;
}
