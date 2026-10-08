'use client';

/**
 * صفحة /update — الوجهة التي يصل إليها المستخدم عند الضغط على إشعار
 * "تحديث التطبيق متاح" (من NotificationBell، صفحة الإشعارات، أو شريط
 * UpdatePrompt). سابقًا كان الضغط على أيٍّ منها يُفعِّل التحديث فورًا دون
 * أي صفحة أو زر وسيط ودون أي مؤشر تقدّم. هذه الصفحة تعرض الآن:
 *  - حالة واضحة (يوجد تحديث / لا يوجد) بدل تنفيذ فوري صامت.
 *  - زرًا صريحًا يبدأ التحديث بإرادة المستخدم.
 *  - مراحل تقدّم حقيقية (تفعيل ثم إعادة تحميل) بدل تجميد الشاشة فجأة.
 *
 * لا "نسبة تنزيل" مزيّفة هنا: بحلول لحظة ظهور هذه الصفحة يكون الملف
 * الجديد قد نُزِّل وثُبِّت فعليًا من طرف المتصفح (registration.waiting)،
 * والمتبقي فعليًا هو خطوتان فقط — تفعيل ثم إعادة تحميل — وهذا بالضبط ما
 * تعرضه الصفحة، مطابقةً لمنطق activateWaitingServiceWorker في lib/pwa.ts.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { onPwaUpdateAvailable, getPwaUpdateRegistration } from '@/components/pwa/UpdatePrompt';
import { activateWaitingServiceWorker, type UpdateStage } from '@/lib/pwa';

type Status = 'idle' | UpdateStage;

const STAGE_LABEL: Record<UpdateStage, string> = {
  activating: 'جارٍ تفعيل النسخة الجديدة…',
  reloading: 'جارٍ إعادة تحميل التطبيق…',
};

// نسبة تقريبية لكل مرحلة — لعرض شريط تقدّم فقط، وليست قياسًا فعليًا لحجم
// الملفات (لا توجد نسبة تنزيل حقيقية متاحة من المتصفح في هذه المرحلة).
const STAGE_PERCENT: Record<Status, number> = {
  idle: 0,
  activating: 55,
  reloading: 90,
};

export default function UpdatePage() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    setRegistration(getPwaUpdateRegistration());
    return onPwaUpdateAvailable(setRegistration);
  }, []);

  function handleStart() {
    if (!registration || status !== 'idle') return;
    activateWaitingServiceWorker(registration, setStatus);
  }

  // يجب أن يكون هناك worker في حالة waiting فعليًا — ليس مجرد registration محفوظة.
  const hasUpdate = Boolean(registration?.waiting);
  const isUpdating = status !== 'idle';

  return (
    <main
      dir="rtl"
      className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center"
    >
      <span
        className={`flex h-20 w-20 items-center justify-center rounded-full ${
          hasUpdate ? 'bg-primary/10 text-primary' : 'bg-online/10 text-online'
        }`}
      >
        {isUpdating ? (
          <Loader2 className="h-10 w-10 animate-spin" />
        ) : hasUpdate ? (
          <RefreshCw className="h-10 w-10" />
        ) : (
          <CheckCircle2 className="h-10 w-10" />
        )}
      </span>

      <h1 className="text-2xl font-semibold">
        {isUpdating
          ? STAGE_LABEL[status as UpdateStage]
          : hasUpdate
            ? 'يتوفر تحديث جديد للتطبيق'
            : 'تطبيقك محدَّث بالفعل'}
      </h1>

      <p className="max-w-sm text-muted-foreground">
        {isUpdating
          ? 'لا تُغلق هذه الصفحة — سيُعاد تحميل التطبيق تلقائيًا خلال لحظات.'
          : hasUpdate
            ? 'اضغط على الزر أدناه لتفعيل آخر الميزات والإصلاحات. لن يُغلق أي عمل مفتوح دون إذنك.'
            : 'لا يوجد تحديث بانتظار التفعيل حاليًا.'}
      </p>

      {(hasUpdate || isUpdating) && (
        <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={STAGE_PERCENT[status]} aria-valuemin={0} aria-valuemax={100}>
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${STAGE_PERCENT[status]}%` }}
          />
        </div>
      )}

      {hasUpdate ? (
        <Button onClick={handleStart} disabled={isUpdating}>
          {isUpdating ? (
            <>
              <Loader2 className="me-2 h-4 w-4 animate-spin" />
              جارٍ التحديث…
            </>
          ) : (
            <>
              <RefreshCw className="me-2 h-4 w-4" />
              ابدأ التحديث
            </>
          )}
        </Button>
      ) : (
        <Button asChild>
          <Link href="/">العودة للرئيسية</Link>
        </Button>
      )}
    </main>
  );
}
