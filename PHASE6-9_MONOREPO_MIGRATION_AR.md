# تقرير المراحل 6–9 — ترحيل MarketPlat إلى Monorepo

## الملفات المعدلة
- `package.json`: إضافة أوامر التحقق من Prisma وWorker، وإضافة Worker إلى فحص الأنواع.
- `pnpm-lock.yaml`: إضافة importer فارغ لحزمة Worker التي لا تضيف اعتماديات جديدة.
- `tooling/verify-workspace.mjs`: التحقق من وجود حزمة Worker وسكربتاتها.
- `tooling/verify-prisma-layout.mjs`: فحص ساكن لتطابق نموذج `AdImageOfflineOperation` مع الترحيل.
- `.github/workflows/workspace-foundation-validation.yml`: إضافة فحص Prisma والتحقق من صياغة JavaScript للـ Worker.
- `workers/cf-api-proxy/package.json`: تعريف Worker كحزمة مساحة عمل.
- أربعة تقارير تفصيلية للمراحل 6 و7 و8 و9 داخل `docs/`.

## النتائج المتحققة في بيئة الفحص
- نجح `node tooling/verify-workspace.mjs`.
- نجح `node tooling/verify-prisma-layout.mjs` مع تحذيرين موثقين.
- نجحت فحوصات JSON وYAML syntax.
- نجحت `node --check` لملفات Worker الثلاثة.
- لم يتمكن الفحص من تنزيل pnpm 10.18.0 بسبب تعذر الوصول إلى registry.npmjs.org؛ لذلك لم ينفذ `pnpm install --frozen-lockfile` ولم يثبت أن القفل ينجح مع pnpm نفسه.

## مخاطر ما زالت مفتوحة
1. لا تزال بعض وظائف CI وملفات Docker القديمة تعتمد على npm و`package-lock.json`. لم تُنقل جميعها لأن الفرق بين النسخ القديمة والجديدة كبير، وأي نقل شامل قبل نجاح تثبيت pnpm سيخلق مخاطرة تشغيلية.
2. المقارنة بين `apps/web` و`frontend` وبين `apps/api` و`backend` كشفت اختلافات فعلية. لم تحذف أي نسخة ولم تنسخ إحداها فوق الأخرى.
3. ترحيل `AdImageOfflineOperation` لا يعرّف foreign keys، ولا يظهر مرجع للنموذج في `apps/api/src` ضمن لقطة المصدر. يجب تأكيد أن هذا مقصود وأن الميزة موصولة قبل اعتماد الترحيل إنتاجيًا.
4. اختبار Worker الكامل لم يُشغّل ضمن هذه المرحلة؛ توجد إشارة سابقة إلى فشل اختبار سياسة التخزين المؤقت، ويجب إصلاحه قبل إدخاله في بوابة `test:all`.
5. لم يتم تشغيل Prisma ضد قاعدة بيانات اختبارية، ولم يتم تطبيق أي migration على قاعدة بيانات.

## التوصية التالية
نفّذ بوابة `Workspace Foundation Validation` على GitHub أولًا. بعد نجاح التثبيت المجمد، انقل workflows التي تستخدم npm تدريجيًا، ثم احسم قرار حذف `frontend/` و`backend/`، وبعد ذلك نفّذ اختبار Prisma على قاعدة اختبار مع نسخة بيانات قابلة للاسترجاع.
