/**
 * نسخ مصغّرة لصور القوائم.
 *
 * الـ backend يرفع الصور إلى Cloudinary بحجم أقصاه 1200×800 (WebP) ويعيد رابطًا واحدًا. عرض هذه الصورة كاملة
 * داخل بطاقة 160dp يفك ضغط صورة كبيرة لكل خلية (ذاكرة + CPU أثناء التمرير). Cloudinary يدعم تصغيرًا عند الطلب
 * عبر الرابط نفسه، فنُدخل تحويلًا صغيرًا بعد `/image/upload/` دون أي تغيير في الـ backend.
 *
 * - يعمل فقط على روابط `https://res.cloudinary.com/<cloud>/image/upload/v<version>/...` غير المحوَّلة سابقًا.
 * - أي رابط آخر (محلي file:/content:، API، رابط محوَّل أصلًا) يُعاد كما هو.
 * - AppImage يعود تلقائيًا إلى الرابط الأصلي إن فشل تحميل النسخة المصغّرة (مثلًا حساب Cloudinary يمنع
 *   التحويلات غير الموقّعة)، فلا تضيع الصورة في أي حال.
 */
const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/?#]+\/image\/upload\/)(v\d+\/.+)$/i;

/** 480px تغطي بطاقة 160dp على شاشة 3x. */
export const LIST_THUMBNAIL_WIDTH = 480;

export function listThumbnailUri(uri: string, width: number = LIST_THUMBNAIL_WIDTH): string {
  if (!Number.isFinite(width) || width <= 0) return uri;
  const match = CLOUDINARY_UPLOAD.exec(uri);
  if (!match) return uri;
  return `${match[1]}c_limit,w_${Math.round(width)},q_auto/${match[2]}`;
}
