# نظام مكافحة الاحتيال (Fraud Detection) — الملفات المعدّلة والجديدة

فك ضغط هذا الملف ودمج مجلد `backend/` فوق مشروعك الحالي (استبدال/دمج
المسارات نفسها). كل مسار هنا مطابق تمامًا لمكانه في المشروع الأصلي.

## ملفات جديدة بالكامل

- `backend/prisma/migrations/20260808000000_add_fraud_detection/migration.sql`
- `backend/src/modules/fraud/fraud.repository.ts`
- `backend/src/modules/fraud/fraud.validation.ts`
- `backend/src/modules/fraud/fraud.service.ts`
- `backend/src/modules/fraud/fraud.controller.ts`
- `backend/src/modules/fraud/fraud.routes.ts`
- `backend/src/modules/fraud/index.ts`
- `backend/tests/integration/fraud.test.ts`

## ملفات معدّلة (موجودة أصلًا، تمت إضافة أجزاء إليها فقط)

- `backend/prisma/schema.prisma`
  - إضافة `riskScore` و `flaggedForReview` إلى موديل `Ad`
  - إضافة موديل `FraudSignal` الجديد
  - إضافة enum `FraudSignalType`
  - إضافة `ADMIN_FRAUD_SIGNAL_REVIEWED` و `ADMIN_FRAUD_MANUAL_FLAG` إلى `AuditEventType`
  - إضافة علاقة `fraudSignals` إلى موديل `User`

- `backend/src/config/env.ts`
  - إضافة متغيرات `FRAUD_*` (نافذة السرعة، حد التفعيل التلقائي...)

- `backend/.env.example`
  - إضافة نفس متغيرات `FRAUD_*` مع تعليقات توضيحية

- `backend/src/shared/errors/errorCodes.ts`
  - إضافة `FRAUD_SIGNAL_NOT_FOUND` و `RAPID_POSTING_BLOCKED`

- `backend/src/modules/ads/ads.service.ts`
  - ربط `fraudService.scoreAd()` داخل `createAd` (fire-and-forget، لا يؤثر على نجاح إنشاء الإعلان)

- `backend/src/routes.ts`
  - تسجيل `fraudRouter` تحت `/admin/fraud`

## بعد الدمج، شغّل

```bash
npx prisma generate
npx prisma migrate dev
npm test -- fraud.test.ts
```

⚠️ لم يتم التحقق من الترجمة (`tsc`) فعليًا في بيئة الإنشاء بسبب عدم توفر
اتصال إنترنت لتثبيت `node_modules` — راجع الكود قبل النشر للإنتاج.
