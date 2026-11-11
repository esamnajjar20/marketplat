# تقرير المرحلة 14 — إصلاح التنقّل داخل المسار وتغطية التنقّل البرمجي

التاريخ: 2026-10-18

## المشكلة

كان مكوّن `NavigationProgress` يبدأ المؤشر عند تغيّر query أو hash حتى عندما يبقى `pathname` نفسه. لكن إخفاء المؤشر يعتمد على تغيّر `pathname`؛ لذلك قد يبقى المؤشر ظاهرًا حتى انتهاء مهلة الأمان (12 ثانية).

## التغييرات

1. حصر شريط التنقّل العام في الانتقال إلى مسار مختلف؛ تغييرات query/hash داخل المسار نفسه لا تبدأ شريط صفحة عالقًا.
2. إضافة اختبار يضمن عدم بدء المؤشر عند التغييرات query-only وhash-only.
3. إضافة اختبار لإشارة `signalNavigationStart(href)` للتنقّل البرمجي إلى مسار مختلف.
4. توسيع التدقيق الساكن لفحص منع المؤشر في تغييرات query/hash والتأكد من دعم إشارة التنقّل البرمجي.
5. تسجيل أمر تدقيق مستقل في `package.json` باسم `ux:route-navigation-loading-phase14-audit`.

## نتائج التحقق

- `node --check frontend/scripts/route-navigation-loading-audit.mjs`: PASS.
- `node frontend/scripts/route-navigation-loading-audit.mjs`: 13/13 PASS.
- `node frontend/scripts/loading-system-audit.mjs`: 50/50 PASS.
- `node frontend/scripts/sync-center-loading-states-audit.mjs`: 10/10 PASS.
- `frontend/package.json` JSON parse: PASS.
- أرشيف المشروع وPatch تم فحصهما باستخدام `unzip -t`.

## القيود

لم تُشغّل اختبارات Vitest/React، ولا TypeScript أو Next.js build أو Playwright؛ لأن `frontend/node_modules` غير متوفر. لذلك الاختبارات الجديدة مكتوبة لكنها لم تُنفّذ في بيئة الاختبارات. كما أن تغييرات query/hash متعمّدة ألا تعرض شريط صفحة عام؛ إذا احتاجت عملية بعينها مؤشرًا أثناء جلب بياناتها، فيجب أن تستخدم حالة تحميل محلية مناسبة.
