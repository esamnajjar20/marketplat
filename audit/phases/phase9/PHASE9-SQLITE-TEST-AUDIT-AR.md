# المرحلة التاسعة — تدقيق اختبارات SQLite وطوابير العمليات

## المشكلة المؤكدة

كان اختبارا `chat-message-outbox` و`mutation-outbox` يفتحان قاعدة الاختبار باسم `marketplat-private-v2.db` عبر المحاكاة، لكن بعض التأكيدات التي تعدّل صفوف SQLite مباشرة كانت تطلب المقبض الخام لقاعدة باسم `marketplat-public-cache.db`. لذلك قد تفشل هذه التأكيدات أو تعمل على قاعدة مختلفة/غير مفتوحة، فلا تختبر الصفوف التي أنشأها الاختبار فعليًا.

## التعديل

- وحّدت اسم قاعدة البيانات في تأكيدات المقبض الخام مع الاسم الذي تفتحه المحاكاة: `marketplat-private-v2.db`.
- أضفت `scripts/verify-sqlite-test-database-aliases.mjs` لمنع عودة هذا التعارض.
- لم أغيّر منطق قاعدة البيانات أو طوابير الرسائل في التطبيق؛ هذا الإصلاح يخص موثوقية الاختبارات.

## ما تم التحقق منه

- `node scripts/verify-sqlite-test-database-aliases.mjs` — نجح.
- `node --check scripts/verify-sqlite-test-database-aliases.mjs` — نجح.
- `node scripts/verify-chat-persistent-outbox-audit.mjs` — نجح (فحص ساكن).
- لم تُشغّل اختبارات Vitest الفعلية لأن `node_modules` غير موجودة في بيئة العمل.
- لم يُختبر SQLCipher أو تنافس SQLite على جهاز Android/iOS، لذا لا أدّعي أن خطأ `database is locked` حُلّ نهائيًا.

## الملفات

- `apps/mobile/src/storage/__tests__/chat-message-outbox.test.ts`
- `apps/mobile/src/storage/__tests__/mutation-outbox.test.ts`
- `apps/mobile/scripts/verify-sqlite-test-database-aliases.mjs`
