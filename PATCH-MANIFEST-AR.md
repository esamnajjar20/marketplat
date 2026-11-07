# حزمة استكمال D1 — الملفات المضافة والمعدّلة

هذه الحزمة Patch وليست نسخة كاملة من المشروع. استخرج محتوياتها فوق جذر مستودع MarketPlat مع الحفاظ على المسارات.

## الملفات المعدّلة

- `workers/cf-api-proxy/worker.ts`
- `workers/cf-api-proxy/cache-policy.test.mjs`
- `frontend/app/api/admin/feature-flags/route.ts`
- `frontend/components/admin/AdminFeatureFlags.tsx`
- `frontend/__tests__/unit/api/admin-feature-flags-route.test.ts`
- `apps/api/package.json`

## الملفات الجديدة

- `apps/api/src/shared/utils/searchCacheWhitelist.ts`
- `apps/api/src/scripts/exportSearchCacheWhitelist.ts`
- `apps/api/tests/unit/search-cache-whitelist.test.ts`
- `CACHE-D1-NEXT-IMPLEMENTATION-AR.md`

## تطبيق الحزمة والتحقق

من مجلد المشروع:

```bash
unzip -o marketplat-d1-improvements.zip -d .
cd workers/cf-api-proxy
npm test
```

بعد ذلك شغّل اختبارات API المعتادة في بيئة التطوير، ثم انشر API Worker بعد مراجعة متغيراته وأسراره:

```bash
cd workers/cf-api-proxy
npx wrangler deploy
```

سيتكوّن جدول `feature_flag_audit` وفهارسه تلقائيًا عند أول استخدام لمسار Feature Flags بعد النشر. اختبر إنشاء علم ثم تغيير الحالة والنسبة، وتحقق من ظهور السجل في لوحة `SUPER_ADMIN`.

لتوليد قائمة المرشحين من Neon بعد ضبط `DATABASE_URL` في بيئة API:

```bash
cd apps/api
npm run report:search-cache-whitelist -- --days=30 --min-count=5
```

راجع النتائج يدويًا قبل وضعها في `SEARCH_CACHE_WHITELIST`؛ لا تُرسل الاستعلامات الخام أو بيانات المستخدمين إلى D1.

**لا تفعّل** `REFERENCE_CACHE_PURGE_READY` أو `REFERENCE_CACHE_LONG_TTL_ENABLED` من هذه الحزمة مباشرة. انشر API/Worker، تأكد من تشغيل Outbox الدائم وتطابق أسرار purge، ثم نفّذ اختبار purge حي لكل الأنواع. فعّل readiness أولاً؛ TTL الطويل قرار منفصل لاحق.
