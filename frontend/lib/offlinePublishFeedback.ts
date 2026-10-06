/**
 * ردود فعل موحّدة عند الحفظ الأوفلاين والرفع
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
    ? `تم تطبيق تعديل ${opts.entity} على جهازك`
    : `تم إنشاء ${opts.entity} على جهازك`;

  const description = opts.queuedBySw
    ? 'سترى العنصر الآن ضمن قائمتك. سيُرفع تلقائيًا عند استقرار الاتصال.'
    : 'العنصر ظاهر لك الآن على جهازك، وسيُنشر تلقائيًا عند عودة الاتصال. يمكنك متابعة حالته من مركز المزامنة.';

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
  entity?: string;
}): void {
  const entity = opts.entity ?? 'العنصر';
  const title =
    opts.mode === 'edit'
      ? 'تم تطبيق التعديل على جهازك'
      : `تم إنشاء ${entity} على جهازك`;

  toast.message(title, {
    description:
      'العنصر ظاهر لك الآن على جهازك، وسيتابع الإرسال تلقائيًا إذا عاد الاتصال.',
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
