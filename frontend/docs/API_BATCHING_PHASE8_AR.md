# المرحلة الثامنة — تجميع بيانات الديون

## المشكلة المثبتة من الكود

كان كل من `DebtsPageClient` و`SalesDebtsSection` يستخدمان hook للقائمة (`GET /sales/debts`) وhook مستقلًا للملخص (`GET /sales/debts/summary`). لذلك عند فتح واجهة الديون كان المتصفح ينفذ اتصالين للحصول على بيانات متعلقة بنفس مساحة العرض.

## التعديل

أضيف endpoint محمي بالمصادقة:

```http
GET /api/v1/sales/debts/overview?page=1&limit=20
```

يرجع `summary` و`debts` ضمن استجابة واحدة. يستخدم backend `Promise.allSettled` ويستدعي منطق الملخص والقائمة الحاليين كما هما، بالتوازي. هذا يقلل اتصالات HTTP ولا يدّعي دمج استعلامات قاعدة البيانات أو تغيير قواعد حساب المديونية.

تحتوي الاستجابة على `failures.summary` و`failures.debts` حتى لا يخفي فشل أحد الجزأين نجاح الآخر. واجهة لوحة المبيعات تعرض تنبيهًا إذا تعذر تحديث الملخص بينما تظل القائمة متاحة.

## الحفاظ على السلوك

- بقيت شروط الديون كما هي: `dueAmount > 0` وحالات الدفع `PARTIAL` و`UNPAID` و`OVERDUE`.
- بقي ترتيب القائمة وترقيمها وحدودها داخل `salesRepository.debts` دون تغيير.
- بقيت مسارات `/sales/debts` و`/sales/debts/summary` للتوافق مع أي مستهلك آخر.
- بقيت حماية المصادقة، وتمرير `AbortSignal`، ومفتاح Query يتضمن الصفحة والحد.
- تغييرات الدفع تستمر بإبطال جذر `sales` الذي يغطي بيانات الديون والملخص.

## الملفات المعدلة

- `apps/api/src/modules/sales/sales.routes.ts`
- `apps/api/src/modules/sales/sales.controller.ts`
- `apps/api/src/modules/sales/sales.service.ts`
- `apps/api/tests/unit/sales.service.test.ts`
- `frontend/api/sales.api.ts`
- `frontend/hooks/queries/useDebts.ts`
- `frontend/lib/queryKeys.ts`
- `frontend/components/sales/DebtsPageClient.tsx`
- `frontend/components/sales/SalesDebtsSection.tsx`
- `frontend/__tests__/unit/api/sales.api.test.ts`

## التحقق

يشمل التسليم تدقيقًا ثابتًا لعقود المرحلة واختبارات وحدة مضافة للنجاح الجزئي وطلب API واحد. فحص TypeScript transpile يثبت سلامة التحليل والصياغة فقط؛ لا يثبت صحة الأنواع الكاملة. لم تُشغّل Jest/Vitest أو `tsc --noEmit` أو build لعدم توفر `node_modules` في بيئة العمل.

بعد الدمج والنشر، يجب نشر API أولًا ثم الواجهة، وقياس Network للتأكد من أن فتح الديون يرسل `/sales/debts/overview` بدل الطلبين القديمين. تبقى المسارات القديمة متاحة.
