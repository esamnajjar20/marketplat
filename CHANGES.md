# الإصلاحات المطبّقة — الدفعة الأولى

هذا الأرشيف يحتوي فقط الملفات التي عُدّلت (10 ملفات، لا ملفات جديدة).
كل مسار مطابق تمامًا لمكانه داخل مشروع marketplat-main الأصلي — يمكنك
استخراج الأرشيف مباشرة فوق نسخة المشروع لتطبيق التعديلات.

## 1. backend/src/modules/auth/auth.service.ts
**الثغرة:** race condition في `resetPassword` — الفحص (`used: false`)
والتحديث كانا عمليتين منفصلتين، فطلبان متزامنان بنفس التوكن يمكن أن
ينفذا كلاهما.
**الإصلاح:** استبدال الفحص المنفصل بـ `updateMany({where: {token,
used: false}})` كشرط ذري ضمن الكتابة نفسها؛ الطلب الخاسر يحصل على
`count === 0` ويُرفض قبل تحديث كلمة المرور.

## 2. backend/src/modules/products/products.repository.ts
## 3. backend/src/modules/products/products.service.ts
## 4. backend/src/modules/ads/ads.repository.ts
## 5. backend/src/modules/ads/ads.service.ts
## 6. backend/src/modules/service-listings/service-listings.repository.ts
## 7. backend/src/modules/service-listings/service-listings.service.ts
**الثغرة:** حظر البائع (`SellerProfile.suspended`) كان يمنع فقط
إنشاء عناصر جديدة، لكن المنتجات/الإعلانات/الخدمات المنشورة سابقًا
تبقى ظاهرة في القوائم العامة وقابلة للوصول المباشر عبر الرابط.
**الإصلاح:**
- إضافة `sellerProfile.suspended: false` (أو المكافئ عبر العلاقة
  المناسبة لكل نموذج) لاستعلامات `findMany` العامة.
- إضافة فحص مكافئ في مسارات العرض المباشر بالمعرّف
  (`getProductById`, `getAdById`, `getServiceListingById`) يُرجع 404
  بدل عرض العنصر.
- في `products.service.ts` تحديدًا: أُضيف أيضًا فحص `store.status
  !== 'ACTIVE'` لإغلاق نفس الثغرة عند حجب المتجر من الإدارة (وليس
  فقط حظر البائع نفسه).

## 8. backend/src/modules/product-categories/product-categories.repository.ts
## 9. backend/src/modules/product-categories/product-categories.service.ts
**الثغرة أ (حلقة مفرغة):** `updateProductCategory` لم يكن يتحقق من
أن `parentId` الجديد ليس هو الفئة نفسها أو أحد أحفادها.
**الإصلاح:** دالة `findParentChain` تتسلق شجرة الأصل المقترح
(بحد أقصى 100 قفزة كحاجز دفاعي)، والخدمة ترفض التحديث إن وُجدت
الفئة الحالية ضمن تلك السلسلة.

**الثغرة ب (FK violation عند الحذف):** حذف فئة تحتوي على فئات فرعية
كان يسبب خطأ Prisma P2003 غير معالج (500). فحص المنتجات المرتبطة
كان موجودًا مسبقًا، لكن فحص الفئات الفرعية لم يكن موجودًا.
**الإصلاح:** دالة `countChildren` وفحص مكافئ لفحص المنتجات، يُرجع
400 برسالة واضحة بدل 500.

## 10. backend/src/modules/service-providers/service-providers.repository.ts
**الثغرة:** استعلام `findNearby` (بحث القرب الجغرافي) كان يحسب
معادلة Haversine (`acos(...)`) على كل صف في الجدول دون أي فلترة
مسبقة، متجاهلاً الفهرس الموجود `@@index([latitude, longitude])`.
**الإصلاح:** إضافة فلترة Bounding Box (`BETWEEN` على `latitude` و
`longitude` مباشرة) قبل حساب Haversine الدقيق — تستفيد من الفهرس
وتقلص عدد الصفوف التي تحتاج الحساب الثقيل إلى نطاق الجوار الجغرافي
فقط.

---

⚠️ **ملاحظة:** لم يتوفر لدي `node_modules` ولا اتصال شبكي للتحقق عبر
`npm run build` (tsc). راجعتُ كل تعديل يدويًا للتأكد من صحة الأنواع،
لكن يُفضّل تشغيل البناء عندك قبل الدمج النهائي.
