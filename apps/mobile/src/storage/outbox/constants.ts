/**
 * ثوابت مشتركة لكل طوابير الـ Outbox (mutations / chat / orders / …).
 * غيّر هنا مرة واحدة بدل تكرار الأرقام في كل ملف.
 */

/** الحد الأقصى للعمليات المعلّقة لكل حساب */
export const OUTBOX_MAX_PENDING = 50;

/** أقصى محاولات إرسال قبل اعتبار العملية exhausted */
export const OUTBOX_MAX_ATTEMPTS = 8;

/** تأخير أساسي قبل إعادة المحاولة (يتضاعف أسّيًا) */
export const OUTBOX_RETRY_BASE_DELAY_MS = 5_000;

/** سقف تأخير إعادة المحاولة (ساعة واحدة) */
export const OUTBOX_RETRY_MAX_DELAY_MS = 60 * 60 * 1_000;

/** مدة امتلاك الـ lease الافتراضية أثناء المعالجة */
export const OUTBOX_DEFAULT_LEASE_MS = 60_000;

/** أقصى طول لمفتاح العملية / المعرّفات */
export const OUTBOX_ID_MAX_LENGTH = 160;

/** أقصى حجم لحمولة JSON (محارف) */
export const OUTBOX_MAX_PAYLOAD_CHARS = 100_000;

/** اسم قاعدة التخزين المشتركة للطوابير */
export const OUTBOX_DATABASE_NAME = 'marketplat-public-cache.db';

/** نمط مفاتيح العمليات الآمن */
export const OUTBOX_OP_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * يحسب تأخير إعادة المحاولة الأسّي مع سقف.
 * attempts يبدأ من 1 بعد أول فشل.
 */
export function computeRetryDelayMs(attempts: number): number {
  const exp = Math.max(0, attempts - 1);
  return Math.min(OUTBOX_RETRY_BASE_DELAY_MS * 2 ** exp, OUTBOX_RETRY_MAX_DELAY_MS);
}
