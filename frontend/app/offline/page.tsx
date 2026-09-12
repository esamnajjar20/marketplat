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

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WifiOff, RotateCw, AlertTriangle, X } from 'lucide-react';
import Link from 'next/link';
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
import { formatNumber } from '@/lib/formatters';

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

  const refreshQueue = useCallback(() => {
    getQueuedRequestCounts().then(({ pending }) => setPendingCount(pending)).catch(() => undefined);
    listFailedRequests().then(setFailedItems).catch(() => undefined);
  }, []);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    refreshQueue();

    const handleOnline = () => {
      setIsOnline(true);
      void requestQueueReplay();
      // FIX OFFLINE-02: router.refresh() فقط يُعيد جلب بيانات المسار
      // الحالي (/offline نفسها) — لا ينقل المستخدم لأي مكان، خلافًا لما
      // كان التعليق يوحي به سابقًا. الانتقال الفعلي للرئيسية يتطلب
      // push صريح. المستخدم عادة كان يحاول الوصول لصفحة أخرى غير
      // الرئيسية، لكنها أضمن نقطة بداية إن كانت الصفحة الأصلية نفسها
      // لم تُخزَّن مسبقًا في الكاش.
      router.push('/');
    };
    const handleOffline = () => setIsOnline(false);

    function onSwMessage(event: MessageEvent) {
      if (QUEUE_EVENT_TYPES.includes(event.data?.type)) refreshQueue();
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    navigator.serviceWorker?.addEventListener('message', onSwMessage);
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
    } finally {
      setBusyId(null);
    }
  };

  const handleDiscardItem = async (id: number) => {
    setBusyId(id);
    try {
      await discardFailedRequest(id);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <span
        className={`flex h-20 w-20 items-center justify-center rounded-full ${
          isOnline ? 'bg-online/10 text-online' : 'bg-muted text-muted-foreground'
        }`}
      >
        <WifiOff className="h-10 w-10" />
      </span>

      <h1 className="text-2xl font-semibold">
        {isOnline ? 'الاتصال عاد — جارٍ التحديث' : 'لا يوجد اتصال بالإنترنت'}
      </h1>

      <p className="max-w-sm text-muted-foreground">
        {isOnline
          ? 'أنت متصل الآن، يمكنك العودة لتصفح الموقع.'
          : 'تحقق من اتصالك بالشبكة. الصفحات التي زرتها سابقًا قد تكون متاحة دون إنترنت.'}
      </p>

      {pendingCount > 0 && (
        <p className="rounded-lg bg-warning/10 border border-warning/30 px-4 py-2 text-sm text-foreground">
          لديك {formatNumber(pendingCount)} طلب{pendingCount > 1 ? 'ات' : ''} بانتظار الإرسال — سيُرسل
          تلقائيًا عند عودة الاتصال.
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

      {!isOnline && (
        <div className="mt-2 flex max-w-sm flex-col gap-2 text-sm">
          <p className="text-muted-foreground">متاح على هذا الجهاز دون نت:</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/downloads">التنزيلات / كتالوجات</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/saved-payments">دفع وبطاقات محفوظة</Link>
            </Button>
            {/* PHASE-OFFLINE-AD-DETAIL */}
            <Button variant="outline" size="sm" asChild>
              <Link href="/saved-ads">إعلانات محفوظة دون اتصال</Link>
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
