# حزمة ميزة Store — الملفات الجديدة والمعدّلة

هذه الحزمة تحتوي على قسمين:

## 1) اختبارات جديدة (من إعدادي) — `backend/tests/`
ملفات اختبار كاملة تغطي ميزة `stores` (repository / service / controller /
validation + اختبارات تكامل)، بالإضافة إلى ملفي مساعدة (helpers) جديدين
لإنشاء بيانات تجريبية (seller profile و store).

```
backend/tests/helpers/sellerProfile.helper.ts
backend/tests/helpers/store.helper.ts
backend/tests/unit/stores.repository.test.ts
backend/tests/unit/store-followers.repository.test.ts
backend/tests/unit/store-reviews.repository.test.ts
backend/tests/unit/stores.service.test.ts
backend/tests/unit/stores.controller.test.ts
backend/tests/unit/stores.validation.test.ts
backend/tests/integration/stores.test.ts
```

هذه الملفات تُضاف داخل مشروعك الحالي في نفس المسارات أعلاه (نسخ ولصق فوق
مجلد `backend/tests`).

## 2) ملفات ميزة Store نفسها (من حزمة `backend-stores-module.zip` الأصلية)
مرفقة هنا للتوثيق/المرجعية فقط — وهي الملفات الجديدة/المعدّلة التي تُشكّل
الميزة التي تُغطّيها الاختبارات:

```
backend/src/modules/stores/*
backend/src/modules/products/*
backend/src/modules/product-categories/*
backend/src/shared/utils/storeLock.ts
backend/src/routes.ts                 (معدّل: تسجيل الراوترات الجديدة)
backend/prisma/schema.prisma          (معدّل: إضافة نماذج Store/Product)
```

## طريقة الدمج
1. انسخ محتوى `backend/src/...` و `backend/prisma/schema.prisma` فوق مشروعك
   (نفس الملفات التي كانت في `backend-stores-module.zip`).
2. انسخ محتوى `backend/tests/...` فوق مجلد `tests` في مشروعك.
3. شغّل `npm test` من جذر الباكيند.

ملاحظة: لم يتم تشغيل الاختبارات فعليًا في بيئة الإعداد (لا يوجد اتصال إنترنت
أو Postgres/Redis)، لذا يُنصح بتشغيلها والتحقق من النتائج في بيئتك.
