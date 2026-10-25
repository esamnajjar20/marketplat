/**
 * FIX ONLINE-SILENT-DRAFT-01: يميّز فشل شبكة/وصول عن أخطاء التحقق (400)
 * أو رفض أعمال (403) حتى نحفظ مسودة محلية عند فشل الإرسال *وأونلاين*
 * دون ادعاء «لا يوجد اتصال».
 *
 * لا يشمل 400/401/403/409 — تلك تحتاج تصحيح بيانات أو جلسة، لا مجرد إعادة إرسال.
 */
import type { ParsedError } from '@/lib/errorParser';
import { isNetworkError, isRetryableStatus } from '@/lib/errorPolicy';

export function isNetworkLikeFailure(parsed: ParsedError): boolean {
  if (parsed.queued) return true;
  if (
    isNetworkError(parsed) ||
    parsed.code === 'NETWORK_ERROR' ||
    parsed.code === 'OFFLINE_QUEUED' ||
    // FIX OFFLINE-QUEUE-RELIABILITY-01: SW refused to store body (quota / size)
    parsed.code === 'QUEUE_STORE_FAILED' ||
    parsed.code === 'QUEUE_BODY_TOO_LARGE'
  ) {
    return true;
  }
  // 0 = لا رد من السيرفر (انقطاع، DNS، CORS، timeout axios…)
  if (parsed.statusCode === 0) return true;
  // بوابات / مهلة / خدمة غير متاحة — ليست validation
  if (isRetryableStatus(parsed.statusCode)) return true;
  return false;
}

export const ONLINE_DRAFT_TOAST = {
  create: {
    title: 'تعذّر الإرسال — حُفظت نسخة محلية',
    description:
      'ليس بسبب انقطاع الإنترنت بالضرورة. راجع من الإعدادات → المزامنة أو عدّل وأعد المحاولة.',
  },
  edit: {
    title: 'تعذّر حفظ التعديل — حُفظت نسخة محلية',
    description:
      'يمكنك المتابعة من الإعدادات → المزامنة أو إعادة المحاولة بعد لحظات.',
  },
} as const;
