/**
 * معرّف عملية واحد يُستخدم لربط نفس "محاولة النشر" بين نظامين مختلفين:
 * طابور الـ SW (public/sw.js، مصدر الحقيقة الفعلي لحالة الإرسال) ومسودة
 * الإعلان (lib/offlineAdDrafts.ts، عرض/محتوى فقط). بدون هذا المعرّف
 * المشترك، onError بأي mutation يسجّل نفس المحاولة بنظامين مستقلّين
 * بلا أي طريقة لاحقة لمعرفة أنهما نفس الشيء (انظر التحقيق السابق —
 * ازدواج بالعدّ + مسودة "شبح" لا تُحدَّث أبدًا).
 *
 * يُرسَل كـ header عادي (X-Offline-Op-Id) مع الطلب نفسه — sw.js's
 * handleMutation يخزّن كل الـ headers أصلًا بالطابور (Headers.forEach)،
 * فقراءته لاحقًا لا تحتاج أي تعديل بنية إضافية هناك، فقط استخراج هذا
 * الحقل بالذات عند queueRequestEntry/الإشعارات.
 */

export const OFFLINE_OP_ID_HEADER = 'X-Offline-Op-Id';

export function newOfflineOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // fallback لبيئات بلا crypto.randomUUID (متصفحات/تشغيلات قديمة نادرة) —
  // ليس معرّفًا آمنًا تشفيريًا، لكنه كافٍ هنا: الغرض ربط محلي بين تبويبين
  // من نفس المتصفح، لا شيء أمني.
  return `op_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
