# ملخص التعديلات — سوق غزة (مجموعة public)

جميع المسارات أدناه نسبية لجذر `frontend/`. انسخ كل ملف إلى نفس المسار في
مشروعك الأصلي (استبدال الملفات الموجودة، وإضافة الملفات الجديدة).

## 1) إصلاح الأخطاء الـ9 من تقرير الفحص

| # | الخطأ | الملفات المعدَّلة/الجديدة |
|---|---|---|
| 1 | صفحة التصنيف لا تُصفّي فعلياً | `app/(public)/categories/[slug]/page.tsx`, `components/ads/SearchFilters.tsx`, `components/ads/SearchResults.tsx` |
| 2 | `/stores` بلا واجهة فلترة | `components/stores/StoresFilters.tsx` **(جديد)**, `lib/constants.ts`, `app/(public)/stores/page.tsx` |
| 3 | زر "متابعة المتجر" لا يعكس الحالة الفعلية | `hooks/queries/useStores.ts`, `hooks/mutations/useStoreMutations.ts`, `lib/queryKeys.ts`, `components/stores/StoreHeader.tsx` |
| 4 | `/service-providers` بلا بديل عند رفض GPS | `components/services/NearbyServiceProviders.tsx` |
| 5 | رابط تصنيف الإعلان يستخدم `id` بدل `slug` | `components/ads/AdDetail.tsx` |
| 6 | فلاتر صفحة التصنيف تُحوّل دائماً إلى `/search` | `components/ads/SearchFilters.tsx` (نفس ملف #1) |
| 7 | `/services` بلا مربع بحث نصي | `components/services/ServiceCategoryFilter.tsx` |
| 8 | بطاقة المنتج تربط بمعامل لا يقرأه أي كود | `components/stores/ProductCard.tsx` لم يتغيّر — المعالجة في `components/stores/StoreProducts.tsx` (تمرير/تمييز/تمرير-تلقائي) |
| 9 | `StoreProducts` و`StoreReviewsList` يتشاركان معامل `page` | `components/shared/ui/Pagination.tsx` (إضافة `pageParam` اختياري)، `components/stores/StoreProducts.tsx`، `components/stores/StoreReviewsList.tsx` |

**ملاحظة هامة عن الخطأ #4:** التقرير أكّد أن الـ Backend لا يملك أي
endpoint لعرض قائمة كاملة لمقدمي الخدمة (فقط `getNearby`/`getById`/
`getMyProvider`). بما أن هذا الملف Frontend فقط، لم أخترع بيانات — بدلاً
من ذلك، عند رفض/عدم دعم GPS تظهر الآن نقطة خروج حقيقية: رابط "تصفّح كل
الخدمات بدل ذلك" إلى `/services` (الذي يدعم التصفح دون GPS فعلاً).
لإصلاح جذري كامل لهذا القيد يلزم إضافة endpoint خلفي جديد.

## 2) التصميم — 4 صفحات رئيسية

- **الرئيسية (`app/(public)/page.tsx`)**: أضيفت حالة "فارغة" مفقودة في
  `RecentAds` (ملاحظة كانت في التقرير)، وأعيد بناء إيقاع الأقسام
  (Eyebrow + عنوان + خط فاصل بدل عناوين نصية مسطحة)، مع منح قسم
  "إعلانات مميزة" شريطاً بلون التراكوتا (accent) الخاص بالهوية ليبدو
  فعلاً كأنه القسم المميز.
- **البحث (`app/(public)/search/page.tsx`)**: أُضيف شريط علوي بلون
  العلامة التجارية (نفس معالجة الـ Hero في الرئيسية) بدل حاوية بيضاء
  عادية، مع تمرير تنسيق فاتح لمربع البحث (`components/search/SearchBox.tsx`
  اكتسب خاصية `inputClassName` اختيارية).
- **تفاصيل الإعلان (`components/ads/AdDetailSection.tsx`)**: أُضيف
  مسار تصفح (Breadcrumb) جديد `components/ads/AdBreadcrumb.tsx`
  يعيد استخدام نفس منطق حل الفئة (slug) من إصلاح الخطأ #5، ومنح
  "إعلانات مشابهة" (`components/ads/RelatedAds.tsx`) عنواناً وخطاً فاصلاً
  متسقين مع بقية الموقع.
- **المتاجر (`app/(public)/stores/page.tsx` و`[id]/page.tsx`)**: أُضيف
  رأس صفحة متسق مع بقية صفحات القوائم (أيقونة + عنوان)، شريط فلاتر
  جانبي فعلي (`StoresFilters.tsx`)، وحالة "غير موجود" محسّنة على صفحة
  تفاصيل المتجر بدل نص مجرد.

## قائمة كاملة بالملفات في هذه الحزمة

```
frontend/app/(public)/categories/[slug]/page.tsx
frontend/app/(public)/page.tsx
frontend/app/(public)/search/page.tsx
frontend/app/(public)/stores/[id]/page.tsx
frontend/app/(public)/stores/page.tsx
frontend/components/ads/AdBreadcrumb.tsx                (جديد)
frontend/components/ads/AdDetail.tsx
frontend/components/ads/AdDetailSection.tsx
frontend/components/ads/RelatedAds.tsx
frontend/components/ads/SearchFilters.tsx
frontend/components/ads/SearchResults.tsx
frontend/components/home/RecentAds.tsx
frontend/components/search/SearchBox.tsx
frontend/components/services/NearbyServiceProviders.tsx
frontend/components/services/ServiceCategoryFilter.tsx
frontend/components/shared/ui/Pagination.tsx
frontend/components/stores/StoreHeader.tsx
frontend/components/stores/StoreProducts.tsx
frontend/components/stores/StoreReviewsList.tsx
frontend/components/stores/StoresFilters.tsx             (جديد)
frontend/components/stores/StoresGrid.tsx
frontend/hooks/mutations/useStoreMutations.ts
frontend/hooks/queries/useStores.ts
frontend/lib/constants.ts
frontend/lib/queryKeys.ts
```

كل التعديلات متوافقة رجعياً (backward-compatible) — أي Props جديدة
اختيارية، ولم يتغيّر أي عقد (contract) على مكوّنات مستخدَمة في أماكن
أخرى من المشروع (تحقّقتُ من كل استدعاءات `SearchFilters`، `SearchResults`،
و`Pagination` في بقية المشروع).
