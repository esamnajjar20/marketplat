# البند 17 — Bulk Actions (AdminReportsTable reference implementation)

نطاق هذه الحزمة: `AdminReportsTable` فقط، كـ reference implementation
كامل قبل التعميم على الجداول الخمسة الباقية (Ads, Users, Sellers,
Stores). كل مسار داخل هذا الأرشيف مطابق لمساره الفعلي بالمشروع —
انسخ فوق الملفات الموجودة، وأضف الجديدة بنفس المسار.

## ملفات جديدة

| المسار | الوصف |
|---|---|
| `frontend/components/shared/ui/Checkbox.tsx` | checkbox مشترك بلا اعتماد على radix (غير مثبّت بالمشروع) |
| `frontend/components/shared/admin/BulkActionBar.tsx` | الشريط اللي يظهر عند تحديد صفوف — قابل لإعادة الاستخدام بباقي الجداول |

## ملفات معدّلة — Backend

| المسار | التعديل |
|---|---|
| `backend/src/modules/reports/reports.validation.ts` | `bulkUpdateReportStatusSchema` (حد أقصى 100 id) |
| `backend/src/modules/reports/reports.repository.ts` | `updateManyStatus` — best-effort عبر `Promise.allSettled`، مش `updateMany` (ما بيرجّع تفاصيل صف بصف) ومش `$transaction` (سجل فاشل ما لازم يسقط الباقي) |
| `backend/src/modules/reports/reports.service.ts` | `bulkUpdateReportStatus` يربط validation بـ repository |
| `backend/src/modules/reports/reports.controller.ts` | `bulkUpdateReportStatus` — يرجع 200 مع `meta.updatedCount`/`meta.failed` حتى لو فيه فشل جزئي |
| `backend/src/modules/reports/reports.routes.ts` | `PATCH /reports/bulk/status` — **مسجّل قبل** `/:id/status` (وإلا Express راح يفسّر "bulk" كـ :id) |
| `backend/tests/integration/reports.test.ts` | 7 اختبارات جديدة: نجاح كامل، فشل جزئي، حدود 0/101 عنصر، status غير صالح، 401، 403 |

## ملفات معدّلة — Frontend

| المسار | التعديل |
|---|---|
| `frontend/api/admin.api.ts` | `bulkUpdateReportStatus()` |
| `frontend/hooks/mutations/useAdminMutations.ts` | `useAdminBulkUpdateReportStatus` — بلا optimistic update (نتيجة الباك إند مصدر الحقيقة لأنها partial-success)، بلا toastWithUndo (لا يوجد undo واحد منطقي لدفعة حتى 100 عنصر) |
| `frontend/components/admin/AdminReportsTable.tsx` | checkboxes لكل صف + select-all، bulk action bar، bulk ConfirmDialog، تصفير التحديد عند تغيّر page/status/targetType |
| `frontend/__tests__/components/AdminReportsTable.test.tsx` | إصلاح اختبار قديم (كان يتوقع عدم وجود ConfirmDialog رغم أن الكود يستخدمه فعليًا منذ UX-FIX P2-05) + 9 اختبارات جديدة لسلوك التحديد الجماعي |

## ملاحظات تصميم مهمة

1. **Best-effort لا all-or-nothing**: دفعة من 50 بلاغ لا يجب أن تفشل كاملة
   لأن بلاغ واحد تمت معالجته من أدمن آخر بنفس اللحظة (race حقيقي بطابور
   متعدد المشرفين). الاستجابة ترجع `updated[]` و`failed[]` بالتفصيل.
2. **الحد الأقصى 100 لكل طلب** — نفس رتبة حد الصفحة الواحدة، لمنع تحويل
   bulk endpoint لعملية على الجدول كامل.
3. **تصفير التحديد عند تغيير الصفحة/الفلتر** — وإلا يبقى الـbulk bar
   يعرض عددًا لبلاغات غير ظاهرة بالشاشة.
4. **لا يوجد bulk toast-with-undo** — قرار واعٍ، موثّق بالكود.

## غير مكتمل / خارج نطاق هذه الحزمة

- تعميم نفس النمط على AdminAdsTable, AdminUsersTable, AdminSellersTable,
  AdminStoresTable (البند التالي بعد مراجعتك لهذا النموذج).
- AdminAuditLogsTable — مستبعد عمدًا (سجل تدقيق للعرض فقط، ليس جدول
  moderation).
- لم يتم تشغيل الاختبارات فعليًا في هذه البيئة (لا يوجد اتصال شبكة
  لتثبيت node_modules) — تمت المراجعة يدويًا (توازن الأقواس، مطابقة
  الأنواع، تتبع كل استدعاء) لكن التشغيل الفعلي لسلسلة CI ما زال مطلوبًا
  قبل الدمج.
