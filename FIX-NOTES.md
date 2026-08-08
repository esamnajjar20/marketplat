# إصلاح خطأ TypeScript بعد إضافة riskScore/flaggedForReview

المشكلة: 3 ملفات في المشروع تستخدم Prisma `select` كـ allowlist صريح
لأعمدة `Ad` (بدل `include` اللي بياخذ كل الأعمدة تلقائيًا). لما أضفنا
`riskScore` و `flaggedForReview` على موديل `Ad`، ما انعكست هالأعمدة في
هالـ allowlists الثلاثة، فصار الـ build يفشل.

## الملفات المصححة (استبدل بها الموجودة عندك بنفس المسار)

- `backend/src/modules/ads/ads.repository.ts` → `adListSelect`
- `backend/src/modules/favorites/favorites.repository.ts` → `favoriteListSelect`
- `backend/src/modules/recommendations/recommendations.repository.ts` → `recommendationAdSelect`

كل التعديل: إضافة سطرين (`riskScore: true` و `flaggedForReview: true`)
داخل كل allowlist، بدون أي تغيير منطقي آخر.

## بعد الاستبدال

```bash
npm run build
```

يفترض يمر بدون أخطاء.
