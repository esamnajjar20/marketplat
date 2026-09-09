# الملفات المعدَّلة — الفئة الثالثة (الأمان والصلاحيات والتوافق)

هذا الأرشيف يحتوي فقط على الملفات التي عُدِّلت، بنفس مسارها الأصلي داخل
المشروع (`marketplat-main/...`). فك الضغط في جذر نسخة المشروع لديك
لدمج الملفات مباشرة في أماكنها الصحيحة (ستستبدل النسخ القديمة).

## الملفات وما تم إصلاحه فيها

| الملف | البند | الوصف |
|---|---|---|
| `backend/src/modules/analytics/analytics.service.ts` | 3.1 | تسجيل أخطاء JWT في `resolveOptionalUserId` بدل ابتلاعها بصمت (بمستوى `debug`) |
| `backend/src/modules/stores/stores.service.ts` | 3.2 | جعل `adminUserId` معاملاً إجبارياً في `updateStoreStatus` بدل اختياري |
| `backend/src/shared/utils/auditLog.ts` | 3.3 | إضافة نوع `AuditLogDetails` موثّق بدل `Prisma.InputJsonValue` الحر |
| `backend/src/middlewares/error.middleware.ts` | 3.4 + 5.9 | إضافة `422: 'UNPROCESSABLE_ENTITY'` إلى `CODE_BY_STATUS` |
| `frontend/lib/i18n/ar/errors.ts` | 3.4 + 5.9 | إضافة الترجمة العربية لكود `UNPROCESSABLE_ENTITY` |
| `frontend/components/services/ReviewServiceRequestDialog.tsx` | 3.7 | استبدال `score as 1\|2\|3\|4\|5` بحارس نوع حقيقي `isReviewScore()` |
| `backend/tests/unit/ads.service.priceChangeNotification.test.ts` | 3.8 | إزالة كل استخدامات `as any` لحقل `price` (استخدام `Prisma.Decimal` حقيقي) |
| `frontend/components/admin/AdminStoresTable.tsx` | 3.9 | استبدال `statusParam as AdminStoreStatus` بحارس نوع `isAdminStoreStatus()` |
| `backend/tests/unit/stores.service.test.ts` | (تابع لـ 3.2) | تحديث الاختبارات لتمرير `adminUserId` الإجباري الجديد |

## ملاحظة
البندان 3.5 (ترجمة كل رسائل الأخطاء بالـ backend) و3.6 (رسائل rate limit)
لم يُعدَّلا بناءً على طلبكم — تبيَّن أن الفرونت اند أصلاً يعتمد في الترجمة
على حقل `code` وليس `message` الإنجليزي، فالأثر العملي لهذه الرسائل محدود.
