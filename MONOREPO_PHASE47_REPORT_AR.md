# تقرير المرحلة 47 — تسلسل حفظ المسودة

## المشكلة
قد تتداخل عمليتا حفظ تلقائي إذا استغرقت كتابة SQLite أكثر من فترة debounce. كما قد ينتهي حذف المسودة بعد نشر الإعلان قبل عملية حفظ قديمة، فتُعاد المسودة إلى قاعدة البيانات.

## التغييرات
- `apps/mobile/src/storage/draft-operation-queue.mjs`: طابور تسلسلي لكل مفتاح حساب، مع تنظيف الطابور بعد الانتهاء والتعافي من رفض العملية.
- `apps/mobile/src/storage/draft-operation-queue.d.mts`: تعريف TypeScript للواجهة.
- `apps/mobile/src/storage/ad-draft-store.ts`: تسلسل عملية read-diff-write للحفظ وتسلسل حذف المسودة خلف الحفظ السابق.
- `apps/mobile/scripts/verify-phase47.mjs`: اختبار تنفيذي لسلوك الترتيب والتوازي بين الحسابات والتعافي بعد الفشل.
- تحديث `apps/mobile/package.json` وخطة الترحيل.

## التحقق
يشغّل `npm test` سلسلة فحوصات المصدر السابقة واختبار Node الجديد. لا ندعي تشغيل TypeScript أو Expo أو SQLite على جهاز فعلي لأن التبعيات غير مثبتة في بيئة العمل.
