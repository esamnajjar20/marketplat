# المرحلة السابعة — تجميع طلبات الأقساط

## المشكلة المثبتة من الشيفرة

كل من `InstallmentsPageClient` و`SalesInstallmentsSection` كان يستدعي hook للأقساط القادمة وآخر للمتأخرة. كان كل hook يستخدم endpoint ومفتاح React Query منفصلين، لذلك فتح أي من القسمين ينتج طلبين HTTP مستقلين.

## التعديل

أضيف endpoint محمي بالمصادقة:

```http
GET /api/v1/sales/installments/overview
```

يعيد `{ upcoming, overdue }` في استجابة واحدة. يستدعي الباك إند طريقتي `upcoming` و`overdue` الحاليتين بالتوازي باستخدام `Promise.all`؛ لم نغيّر شروط الحالة أو حدود النتائج (200 لكل قائمة) أو ترتيبها أو تضمين بيانات العميل.

تم توحيد استعلام React Query في `queryKeys.installments.overview()` واستعمال `useInstallmentsOverview` في صفحة الأقساط وقسمها داخل لوحة المبيعات. بعد تسجيل دفعة، يُبطل كاش النظرة العامة الموحّدة بدل إبطال قائمتين منفصلتين.

## ما لم يتغير

- عمليات دفع الأقساط والتحقق المالي والمعاملات وقفل الصفوف لم تتغير.
- لا تُخزّن استجابة الأقساط في كاش HTTP عام؛ المسار يبقى خلف المصادقة.
- لا ندّعي تقليل استعلامات قاعدة البيانات: ما زال هناك استعلام مستقل لكل قائمة، لكنهما يُنفذان بالتوازي خلف اتصال HTTP واحد.
- endpoint القديمان `/upcoming` و`/overdue` لم يُحذفا لتجنب كسر أي عميل قديم أو تطبيق موبايل.

## الملفات المعدلة

- `apps/api/src/modules/sales/installments.service.ts`
- `apps/api/src/modules/sales/installments.controller.ts`
- `apps/api/src/modules/sales/installments.routes.ts`
- `apps/api/tests/unit/installments.service.test.ts`
- `frontend/api/installments.api.ts`
- `frontend/hooks/queries/useInstallments.ts`
- `frontend/hooks/mutations/useInstallmentMutations.ts`
- `frontend/lib/queryKeys.ts`
- `frontend/components/sales/InstallmentsPageClient.tsx`
- `frontend/components/sales/SalesInstallmentsSection.tsx`
- `frontend/__tests__/unit/hooks/useDemandDrivenPrivateQueries.test.tsx`
- `frontend/package.json`
- `frontend/scripts/api-batching-phase7-audit.mjs`

## التحقق

شغّل من مجلد `frontend`:

```bash
npm run network:batching-phase7-audit
```

التدقيق ساكن ويتحقق من وجود المسار الجديد واستخدامه في الشاشتين ومن إبطال الكاش. لا يغني عن اختبارات Jest/Vitest أو `tsc --noEmit` أو بناء الإنتاج.

## تحقق ما بعد النشر

افتح `/account/sales/installments` ثم قسم الأقساط في لوحة المبيعات. ينبغي أن يظهر طلب واحد `GET /sales/installments/overview` لكل فتح فعلي للشاشة، وألا تظهر طلبات `/upcoming` و`/overdue` من هاتين الواجهتين. بعد تسجيل دفعة، يجب أن تُحدّث القائمتان من طلب overview جديد.
