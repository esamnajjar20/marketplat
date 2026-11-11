# المرحلة 6 — إغلاق بنود النقد المتبقية

## من النقد → التنفيذ

| ملاحظة النقد | التنفيذ في المرحلة 6 |
|--------------|----------------------|
| توثيق معماري موحّد | `docs/ARCHITECTURE.md` |
| توحيد .mjs و .ts | `outbox-sync-policy.ts`, `outbox-transport-contract.ts`, `draft-operation-queue.ts` |
| تنظيم الشاشات | `docs/SCREEN-ORGANIZATION-AR.md` |
| حجم الحزمة / splitting | `docs/BUNDLE-CODE-SPLITTING-AR.md` |
| Sentry / تتبع أخطاء | `error-reporting.ts` مع `initErrorReporting({ dsn })` |
| ملفات رئيسية ضخمة | `HomeAdsList.tsx` كنموذج تقسيم |
| اختبارات إضافية | `outbox-sync-policy.test.ts` |

## ما لم يُنفَّذ بالكامل (موثّق)
انظر `REMAINING-AFTER-PHASE6-AR.md`.

## دمج سريع
- انسخ ملفات `src/storage/*policy*`, `*contract*`, `draft-operation-queue.ts`
- احذف `.mjs` القديمة بعد نجاح `tsc`
- انسخ `HomeAdsList` واستخدمه من `index` تدريجيًا
