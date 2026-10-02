/**
 * FIX OFFLINE-PUBLISH-UX-01: ردود فعل موحّدة عند الحفظ الأوفلاين والرفع
 * التلقائي — لا يُترك المستخدم بلا توجيه (ماذا حصل؟ ماذا يفعل؟ أين يتابع؟).
 */
import { toast } from 'sonner';
import { ROUTES } from '@/lib/constants';

function goSyncCenter(): void {
  if (typeof window === 'undefined') return;
  window.location.href = ROUTES.offline.sync;
}

const SYNC_ACTION = {
  label: 'مركز المزامنة',
  onClick: goSyncCenter,
} as const;

export type OfflineEntityLabel =
  | 'الإعلان'
  | 'المنتج'
  | 'الخدمة'
  | 'الطلب'
  | 'التعديل';

/**
 * بعد حفظ مسودة بسبب انقطاع نت أو طابور SW (queued).
 * يوضح أن العملية لم تُلغَ وأن الرفع سيتم تلقائيًا + رابط للمتابعة.
 */
export function toastOfflineSaved(opts: {
  entity: OfflineEntityLabel;
  mode?: 'create' | 'edit';
  queuedBySw?: boolean;
}): void {
  const isEdit = opts.mode === 'edit';
  const title = isEdit
    ? `تعديل ${opts.entity} محفوظ محليًا`
    : `${opts.entity} محفوظ محليًا — لم يُنشر بعد`;

  const description = opts.queuedBySw
    ? 'الطلب في طابور الإرسال وسيُرفع تلقائيًا عند استقرار الاتصال. تابع الحالة من مركز المزامنة.'
    : 'سيُرفع تلقائيًا عند عودة الإنترنت (مع الصور إن وُجدت). يمكنك المتابعة أو إعادة المحاولة من مركز المزامنة.';

  toast.message(title, {
    description,
    duration: 9000,
    action: SYNC_ACTION,
  });
}

/**
 * فشل شبكة وأونلاين ظاهريًا — مسودة محفوظة بلا ادعاء «انقطع النت».
 */
export function toastSoftNetworkDraft(opts: {
  mode?: 'create' | 'edit';
}): void {
  const title =
    opts.mode === 'edit'
      ? 'تعذّر حفظ التعديل — حُفظت نسخة محلية'
      : 'تعذّر الإرسال — حُفظت نسخة محلية';

  toast.message(title, {
    description:
      'ليس بالضرورة بسبب انقطاع الإنترنت. أعد المحاولة لاحقًا أو افتح مركز المزامنة للمتابعة.',
    duration: 9000,
    action: SYNC_ACTION,
  });
}

/**
 * نتيجة الرفع التلقائي من المسودات عند عودة النت / زر مزامنة.
 * لا يُظهر شيئًا إذا لم يحدث إرسال أو فشل (تجنّب إزعاج دوري).
 */
export function toastDraftPublishResult(result: {
  sent: number;
  failed: number;
  skipped?: number;
}): void {
  const { sent, failed } = result;
  if (sent <= 0 && failed <= 0) return;

  if (sent > 0 && failed === 0) {
    toast.success(
      sent === 1
        ? 'تم رفع العنصر المحفوظ محليًا بنجاح'
        : `تم رفع ${sent} عناصر كانت محفوظة محليًا`,
      {
        description: 'أصبحت منشورة على السيرفر.',
        duration: 7000,
      },
    );
    return;
  }

  if (sent > 0 && failed > 0) {
    toast.message(`رُفع ${sent} وفشل ${failed}`, {
      description: 'راجع العناصر الفاشلة من مركز المزامنة لإعادة المحاولة أو التعديل.',
      duration: 10000,
      action: SYNC_ACTION,
    });
    return;
  }

  // failed only
  toast.error(
    failed === 1 ? 'تعذّر رفع عنصر محفوظ محليًا' : `تعذّر رفع ${failed} عناصر محفوظة محليًا`,
    {
      description: 'افتح مركز المزامنة لإعادة المحاولة أو تعديل المسودة.',
      duration: 10000,
      action: SYNC_ACTION,
    },
  );
}

/** أثناء المزامنة اليدوية من الشاشة — قبل اكتمال الرفع. */
export function toastSyncStarted(): void {
  toast.message('جاري المزامنة…', {
    description: 'إرسال الطلبات المعلّقة والمسودات المحلية.',
    duration: 4000,
  });
}
