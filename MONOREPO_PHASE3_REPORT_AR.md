# تقرير المرحلة 3 — حزمة العقود المشتركة

## المنجز

- إضافة `packages/contracts` كحزمة مستقلة.
- إضافة `apiSuccessResponseSchema` و`apiErrorResponseSchema` باستخدام Zod، مع أنواع TypeScript مشتقة.
- إضافة `paginationQuerySchema` و`paginationMetaSchema` كعقود عامة أولية.
- إضافة اختبارات حراسة لا تحتاج تثبيت حزم، وأوامر جذر `test:contracts` و`type-check:contracts`.
- تحديث خطة الهجرة لتسجيل نطاق المرحلة وحدودها.

## قرارات السلامة

- لم تُحذف أو تُنقل ملفات الويب أو الـ API أو Capacitor.
- لم تُغيّر استيرادات الإنتاج لاستخدام الحزمة الجديدة بعد؛ لا يوجد `pnpm-lock.yaml` موثوق ولا تم تشغيل تثبيت/build كامل في هذه البيئة.
- حدود pagination هنا عامة فقط، ويجب عدم استخدامها بدل قواعد endpoint-specific.

## التحقق

سيُشغّل الاختبار المستقل `node --test packages/contracts/test/*.test.mjs` وفحص JSON وفاحص مساحة العمل. لا يعني نجاح هذه الاختبارات البنيوية أن TypeScript أو Zod runtime أو build كامل قد نجح؛ ذلك يتطلب تثبيت التبعيات وتشغيل أوامر pnpm في بيئة متصلة.

## التالي

1. توليد lockfile باستخدام إصدار pnpm المعلن في الجذر.
2. تشغيل type-check واختبارات الويب والـ API قبل توصيل المستهلكين بالعقود.
3. إضافة fixtures تقارن مخطط الخطأ المشترك مع عينات فعلية من الـ API.
4. بعدها يبدأ scaffold تطبيق React Native + Expo في `apps/mobile`، مع دعم العربية وRTL دون المساس بتطبيق الويب.
