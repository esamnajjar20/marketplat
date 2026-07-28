/**
 * صفحة Offline — تُعرض من الـ Service Worker (public/sw.js) كـ fallback
 * عند فشل أي تنقّل بين الصفحات بسبب انقطاع الإنترنت.
 *
 * ليست صفحة ثابتة بحتة: تعرض أيضًا عدد الطلبات المعلّقة في طابور
 * IndexedDB (lib/offlineQueue.ts) وتحاول إعادة الاتصال تلقائيًا،
 * وهو أمر ضروري لجمهور يعاني من إنترنت ضعيف/متقطع.
 */
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WifiOff, RotateCw } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { getQueuedRequestCount, requestQueueReplay } from '@/lib/offlineQueue';

export default function OfflinePage() {
  const router = useRouter();
  // FIX OFFLINE-01: هذه الصفحة تُعرض أصلًا من sw.js فقط كـ fallback عند
  // فشل التنقّل بسبب انقطاع الاتصال — القيمة الابتدائية الصحيحة منطقيًا
  // هي false، وليس true. البدء بـ true كان يُظهر "الاتصال عاد" للحظة قبل
  // أن يُصحِّحها useEffect إلى navigator.onLine الفعلي، وهي رسالة خاطئة
  // بالضبط في اللحظة التي يحتاج فيها المستخدم فهم حالته بدقة.
  const [isOnline, setIsOnline] = useState(false);
  const [queuedCount, setQueuedCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    getQueuedRequestCount().then(setQueuedCount).catch(() => undefined);

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

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [router]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      if (navigator.onLine) {
        router.push('/');
        router.refresh();
      }
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <span
        className={`flex h-20 w-20 items-center justify-center rounded-full ${
          isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'
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

      {queuedCount > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          لديك {queuedCount} طلب{queuedCount > 1 ? 'ات' : ''} بانتظار الإرسال — سيُرسل تلقائيًا
          عند عودة الاتصال.
        </p>
      )}

      <Button onClick={handleRetry} disabled={isRetrying}>
        <RotateCw className={`me-2 h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
        إعادة المحاولة
      </Button>
    </main>
  );
}
