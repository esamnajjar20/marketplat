# إصلاح عاجل — كسر بناء ناتج عن M-024 في ads.validation.ts

## المشكلة
دفعة M-024 (ضمن batch2) لفّت `getAdsSchema`'s query object مباشرة
بـ `.refine()`، مما حوّله من `ZodObject` إلى `ZodEffects`. لكن نفس
الملف يحتوي سطرين آخرين (`getMyAdsSchema`, `searchAdsSchema`) يعتمدان
على `getAdsSchema.shape.query.extend({...})` — و`.extend()` غير
موجودة على `ZodEffects`، فقط على `ZodObject` الخام. هذا سبب 8 أخطاء
TypeScript عند `npm run build` (2 في ads.controller.ts، 4 في
ads.service.ts، 2 في ads.validation.ts نفسه) لأن الأنواع المُصدَّرة
(`GetAdsQuery`, `GetMyAdsQuery`, `SearchAdsQuery`) سقطت إلى `unknown`.

## الحل
- أُخرج جسم الاستعلام الخام إلى ثابت منفصل `baseAdsQuerySchema`
  (ZodObject عادي، يدعم `.extend()`).
- فحص `minPrice <= maxPrice` أصبح دالة مساعدة `withPriceRangeCheck`
  تُطبَّق عبر `.superRefine()` (نفس النمط المستخدم فعلاً في
  `config/env.ts`'s `envSchemaWithRedisCheck`) على **كل واحد** من
  الثلاثة: `getAdsSchema`، و`getMyAdsSchema` (بعد `.extend()` بحقل
  status)، و`searchAdsSchema` (بعد `.extend()` بحقل q المطلوب).
- تأكدت أنه لا يوجد أي مكان آخر في كامل الباك-إند يستخدم
  `.shape.query` على `getProductsSchema` أو `getServiceListingsSchema`
  (الملفين الآخرين اللذين لمستهما M-024) — فبقيا بصيغتهما الأصلية
  (refine مباشر) بدون مشكلة.

## الملف المتأثر
| الملف | ملاحظة |
|---|---|
| `backend/src/modules/ads/ads.validation.ts` | استبدال كامل — يحل محل نفس الملف من batch2 |

هذا الملف **يستبدل** نسخته من `marketplat-fixes-batch2.zip` بالكامل —
فكّه فوق المشروع بعد batch2 (أو بدلاً من إعادة فك ads.validation.ts
منها) ثم أعد `npm run build`.
