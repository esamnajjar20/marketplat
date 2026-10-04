/**
 * صفحة Offline — تُعرض من الـ Service Worker (public/sw.js) كـ fallback
 * عند فشل أي تنقّل بين الصفحات بسبب انقطاع الإنترنت.
 *
 * ليست صفحة ثابتة بحتة: تعرض أيضًا عدد الطلبات المعلّقة في طابور
 * IndexedDB (lib/offlineQueue.ts) وتحاول إعادة الاتصال تلقائيًا،
 * وهو أمر ضروري لجمهور يعاني من إنترنت ضعيف/متقطع.
 *
 * FIX QUEUE-COUNT-01: كانت تعرض getQueuedRequestCount الخام (يشمل عناصر
 * status:'failed' التي لن تُعاد تلقائيًا أبدًا حسب sw.js's replayOne) تحت
 * نص "سيُرسل تلقائيًا عند عودة الاتصال" — وعد خاطئ لأي عنصر فاشل ضمن
 * العدد. الآن تُستخدم getQueuedRequestCounts لعرض pending/failed منفصلين،
 * ومع وجود عنصر فاشل واحد على الأقل تُعرض قائمة قابلة للتفاعل (إعادة
 * محاولة/تجاهل لكل عنصر — نفس بروتوكول RETRY_QUEUE_ITEM/DISCARD_QUEUE_ITEM
 * الذي واجهة رسائل المحادثة تستخدمه أصلًا، هنا لعناصر غير الرسائل التي لم
 * يكن لها أي واجهة حل من قبل إطلاقًا).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WifiOff, RotateCw, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  getQueuedRequestCounts,
  listFailedRequests,
  retryFailedRequest,
  discardFailedRequest,
  requestQueueReplay,
  QUEUE_EVENT_TYPES,
  type QueuedRequestSummary,
} from '@/lib/offlineQueue';
import { syncPendingOfflineDrafts } from '@/lib/offlineDraftPublisher';
import { toastDraftPublishResult } from '@/lib/offlinePublishFeedback';
import { formatNumber } from '@/lib/formatters';
import { formatSyncEta } from '@/lib/connectionQuality';
import { OfflineHub } from '@/components/offline/OfflineHub';

import { resolveOfflineTab, type OfflineTab } from '@/lib/offlineHubTabs';

export default function OfflinePage() {
  const router = useRouter();
  // FIX OFFLINE-01: هذه الصفحة تُعرض أصلًا من sw.js فقط كـ fallback عند
  // فشل التنقّل بسبب انقطاع الاتصال — القيمة الابتدائية الصحيحة منطقيًا
  // هي false، وليس true. البدء بـ true كان يُظهر "الاتصال عاد" للحظة قبل
  // أن يُصحِّحها useEffect إلى navigator.onLine الفعلي، وهي رسالة خاطئة
  // بالضبط في اللحظة التي يحتاج فيها المستخدم فهم حالته بدقة.
  const [isOnline, setIsOnline] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [failedItems, setFailedItems] = useState<QueuedRequestSummary[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  // OFFLINE-HUB-01: tab requested by the URL (?tab=… or a legacy path the SW
  // answered with this fallback). null = plain fallback / bare /offline.
  const [initialTab, setInitialTab] = useState<OfflineTab | null>(null);
  // True when the user came here on purpose (explicit tab). The 'online'
  // event must then NOT bounce them to '/' while they manage their data.
  const deliberateRef = useRef(false);

  useEffect(() => {
    const tab = resolveOfflineTab(window.location.search, window.location.pathname);
    deliberateRef.current = tab !== null;
    setInitialTab(tab);
  }, []);

  const refreshQueue = useCallback(() => {
    getQueuedRequestCounts().then(({ pending }) => setPendingCount(pending)).catch(() => undefined);
    listFailedRequests().then(setFailedItems).catch(() => undefined);
  }, []);

  useEffect(() => {
    const online = navigator.onLine;
    setIsOnline(online);
    refreshQueue();

    const recoverToApp = () => {
      setIsOnline(true);
      // OFFLINE-PAGE-FIXES-01: requestQueueReplay can reject (SW
      // unreachable, IndexedDB hiccup). Previously only .finally was
      // attached, so a rejection escaped to the global handler.
      void requestQueueReplay()
        .catch((err) => {
          console.warn('[offline] requestQueueReplay failed:', err);
        })
        .finally(() => {
          window.setTimeout(() => {
            void syncPendingOfflineDrafts({ includeFailed: true })
              .then((r) => {
                if (r.sent > 0 || r.failed > 0) toastDraftPublishResult(r);
              })
              .catch((err) => {
                console.warn('[offline] syncPendingOfflineDrafts failed:', err);
              });
          }, 1500);
        });
      // FIX OFFLINE-FALSE-TIMEOUT-01: /offline may appear after a navigate
      // soft-timeout while navigator.onLine is still true — the 'online'
      // event never fires. Same recovery path as a real online transition.
      // OFFLINE-HUB-01: auto-exit only when this page is acting as the
      // fallback. A deliberate visit (explicit tab) stays put.
      if (!deliberateRef.current) router.push('/');
    };

    const handleOnline = () => {
      recoverToApp();
    };
    const handleOffline = () => setIsOnline(false);

    function onSwMessage(event: MessageEvent) {
      if (QUEUE_EVENT_TYPES.includes(event.data?.type)) refreshQueue();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

    // OFFLINE-PAGE-FIXES-01: no auto-redirect. Previously we pushed to /
    // after 800ms when navigator.onLine was true (to unstick users who
    // landed here after a slow-navigation timeout). But it also kicked
    // out users who came here on purpose — offline reading, catalog
    // browsing, or checking pending items. Now: the banner below says
    // 'الاتصال يعمل' and the primary CTA is right there; the user
    // decides. The real 'online' event still auto-recovers (that path
    // is unambiguous — the browser just transitioned from offline).
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
    };
  }, [router, refreshQueue]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      // دائمًا نحاول الرجوع للرئيسية — حتى لو ما زال الأوفلاين:
      // الرئيسية غالبًا مخزَّنة في STATIC_CACHE (CORE_ROUTES) فيقدر الـSW
      // يخدمها من الكاش. تنقّل قاسٍ (location) أفضل من router.push هنا
      // لأننا أصلًا على fallback من الـSW وقد تكون حالة الـrouter متضررة.
      if (typeof window !== 'undefined') {
        window.location.assign('/');
        return;
      }
      router.push('/');
      router.refresh();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleRetryItem = async (id: number) => {
    setBusyId(id);
    try {
      await retryFailedRequest(id);
    } catch (err) {
      // OFFLINE-PAGE-FIXES-01
      console.warn('[offline] retryFailedRequest failed:', err);
      // Best-effort: refresh the list so a state change is reflected.
      refreshQueue();
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscardItem = async (id: number) => {
    setBusyId(id);
    try {
      await discardFailedRequest(id);
    } catch (err) {
      // OFFLINE-PAGE-FIXES-01
      console.warn('[offline] discardFailedRequest failed:', err);
      refreshQueue();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen min-h-dvh w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 text-center">
      <span
        className={`flex h-20 w-20 items-center justify-center rounded-full ${
          isOnline ? 'bg-online/10 text-online' : 'bg-muted text-muted-foreground'
        }`}
      >
        <WifiOff className="h-10 w-10" />
      </span>

      <h1 className="text-2xl font-semibold">
        {isOnline ? 'مركز الأوفلاين' : 'لا يوجد اتصال بالإنترنت'}
      </h1>

      <p className="max-w-sm text-muted-foreground">
        {isOnline
          ? 'أنت متصل الآن. أدِر المحفوظات والمسودات والمزامنة والتخزين من هنا، أو عُد لتصفح الموقع.'
          : 'تحقق من اتصالك بالشبكة. الصفحات التي زرتها سابقًا قد تكون متاحة دون إنترنت.'}
      </p>

      {pendingCount > 0 && (
        <p className="rounded-lg bg-warning/10 border border-warning/30 px-4 py-2 text-sm text-foreground">
          لديك {formatNumber(pendingCount)} طلب{pendingCount > 1 ? 'ات' : ''} بانتظار الإرسال
          {' — ستُرسل خلال '}
          {formatSyncEta(pendingCount) || '~30 ثانية'}
          {' عند عودة الاتصال.'}
        </p>
      )}

      {failedItems.length > 0 && (
        <div className="w-full max-w-sm rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-start">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {formatNumber(failedItems.length)} عملية لم تُرسَل — تحتاج قرارك
          </p>
          <ul className="flex flex-col gap-2">
            {failedItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-md bg-background px-2.5 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {item.lastError?.message || `${item.method} فشل${item.lastError?.status ? ` (${item.lastError.status})` : ''}`}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2"
                    disabled={busyId === item.id}
                    onClick={() => handleRetryItem(item.id)}
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive"
                    aria-label="تجاهل هذه العملية"
                    disabled={busyId === item.id}
                    onClick={() => handleDiscardItem(item.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button onClick={handleRetry} disabled={isRetrying}>
        <RotateCw className={`me-2 h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
        {isOnline ? 'إعادة المحاولة' : 'العودة للرئيسية'}
      </Button>

      </div>

      {/* OFFLINE-HUB-01: replaces the old link list (التنزيلات / إعلانات
          محفوظة / إدارة التسخين) — those are now tabs below. */}
      <div className="w-full rounded-3xl border border-border/70 bg-card/40 p-3 shadow-sm sm:p-5 lg:p-6">
        <OfflineHub initialTab={initialTab} />
      </div>
    </main>
  );
}
