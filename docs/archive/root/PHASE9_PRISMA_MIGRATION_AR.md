# المرحلة 9 — Prisma والترحيلات

## فحوص أضيفت
- `tooling/verify-prisma-layout.mjs` يتحقق ساكنًا من تطابق حقول `AdImageOfflineOperation` والفهارس الأساسية بين Prisma schema وملف الترحيل.
- بوابة التحقق اليدوية تشغّل الفحص الساكن ثم `prisma validate` باستخدام عناوين اتصال اختبارية؛ لا تنفذ `migrate deploy` ولا تتصل بقاعدة بيانات.

## نتائج تستلزم متابعة
- الترحيل `20261025100000_add_ad_image_offline_idempotency` ينشئ جدول replay ledger وفهارس فريدة/مساعدة. لا يضيف مفاتيح أجنبية إلى ads/users؛ هذا قد يكون مقصودًا للاحتفاظ بسجل idempotency بعد حذف الكيانات، لكنه يحتاج قرارًا موثقًا.
- في لقطة المصدر التي فُحصت، لم يظهر `AdImageOfflineOperation` في `apps/api/src`، مع وجود النموذج في Prisma. الفحص سيصدر تحذيرًا بهذا الخصوص؛ يجب التحقق مما إذا كانت الميزة غير موصولة بالكود أو تستخدم SQL/مسارًا آخر.
- لم تُشغّل ترحيلات على قاعدة اختبار حقيقية، ولم يُختبر التزامن أو rollback أو التوافق مع بيانات موجودة. لا تُعتبر هذه المرحلة موافقة إنتاجية على الترحيل.

## تحقق محلي بعد تنزيل الملفات
```bash
pnpm run verify:prisma-layout
pnpm --filter classifieds-platform-backend exec prisma validate
# على قاعدة اختبار فارغة/نسخة اختبارية فقط، وبعد إعداد DATABASE_URL وDIRECT_URL:
pnpm --filter classifieds-platform-backend exec prisma migrate deploy
```
