# MarketPlat — المرحلة السادسة: توحيد العقود والاختبارات

## النطاق المنفذ

1. تحديث `packages/contracts` ليعكس الحدود الفعلية للـ API: `page` من 1 إلى 1000 و`limit` من 1 إلى 100.
2. توحيد حقول بيانات الترقيم: `page`, `limit`, `total`, `totalPages`, `hasNextPage`, `hasPrevPage`, `nextCursor`.
3. جعل عقد نجاح API متسامحًا مع غياب `message` في بعض المسارات القديمة، مع المحافظة على `success: true`.
4. توسيع عقد الأخطاء ليشمل `statusCode`, `code`, `requestId`, `meta`, `errors`, `errorMeta`، مع الحفاظ على الحقول الإضافية.
5. توسيع مخطط استجابة الموبايل ليقبل حقول الترقيم التي يرسلها الخادم.
6. إضافة اختبارات مطابقة بين العقد المشترك وتعريفات API والويب والموبايل.

## اختلافات مؤكدة عولجت

- كان الحد الأقصى لـ `page` في العقد المشترك 100 بينما يقبل API حتى 1000.
- كان العقد المشترك لا يعرّف `hasNextPage` و`hasPrevPage`.
- لم يكن `nextCursor` جزءًا من تعريف بيانات الترقيم المشترك بشكل متكامل.
- مخطط الترقيم في الموبايل لم يكن يقبل `hasNextPage` و`hasPrevPage` رغم وجودهما في عقد الخادم والويب.

## الاختبارات

تم تشغيل:

```sh
node --test packages/contracts/test/*.test.mjs
```

النتيجة: 5 اختبارات ناجحة، 0 فاشلة.

الاختبارات تغطي تطابق الحدود، وحقول pagination في الموبايل، وحقول API error envelope، وحقول التنقل في أنواع الويب والموبايل، وصادرات حزمة العقود.

## حدود التحقق

- لم يتم تشغيل TypeScript build/type-check أو Jest/Vitest لأن مجلدات `node_modules` غير موجودة في بيئة التنفيذ.
- لم يتم تحويل API والويب والموبايل بعد إلى استيراد runtime واحد من `@marketplat/contracts`. السبب أن `frontend/` خارج pnpm workspace عمدًا، كما أن حدود TypeScript الحالية في API والموبايل لا تسمح بإدخال مصدر الحزمة مباشرة دون ضبط بناء منفصل. أضيفت اختبارات drift كحماية عملية في هذه المرحلة.
- لم يتم تعديل `pnpm-lock.yaml` أو إضافة اعتماديات جديدة.
- لم تُصلح الاختبارات القديمة غير المرتبطة بهذه التغييرات.

## الملفات المعدلة

- `packages/contracts/src/api-response.ts`
- `packages/contracts/src/pagination.ts`
- `packages/contracts/test/consumer-parity.test.mjs`
- `packages/contracts/README.md`
- `apps/mobile/src/api/response-schemas.ts`
- `apps/mobile/src/lib/pagination.ts`
- `package.json`
- `audit/phases/phase6/PHASE6-CONTRACTS-AND-TESTS-AR.md`

## فحوص إضافية خارج مجموعة العقود

- `apps/mobile/scripts/verify-messaging-api-contracts.mjs`: ناجح.
- `apps/mobile/scripts/verify-mobile-list-contracts.mjs`: ناجح (17/17).
- `apps/mobile/scripts/verify-mobile-critical-contracts.mjs`: فشل في assertion قديم متعلق ببقاء تنفيذ مكرر لطابور المسودات (`no unused duplicate draft queue implementation remains`). هذا الفشل خارج الملفات التي تغيرت في المرحلة السادسة، ولم يتم إصلاحه ضمن هذا النطاق.
- `pnpm test:contracts`: لم يبدأ لأن أمر `pnpm` غير مثبت في بيئة التنفيذ.
