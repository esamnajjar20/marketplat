# دليل ملفات ميزة البحث الموحّد

كل المسارات نسبية لجذر المشروع (`marketplat-main/`). انسخ كل ملف إلى نفس
المسار في مشروعك — الملفات "معدَّلة" تستبدل النسخة الحالية بالكامل.

## Backend

### ملفات جديدة بالكامل (موديول البحث)
```
backend/src/modules/search/index.ts
backend/src/modules/search/search.types.ts
backend/src/modules/search/search.validation.ts
backend/src/modules/search/search.repository.ts
backend/src/modules/search/search.service.ts
backend/src/modules/search/search.controller.ts
backend/src/modules/search/search.routes.ts
```

### Migration جديدة (فهارس GIN لأربعة جداول)
```
backend/prisma/migrations/20260802120000_add_search_indexes/migration.sql
```
شغّل `npx prisma migrate deploy` (أو `migrate dev` في التطوير) بعد النسخ.

### اختبار وحدة جديد
```
backend/tests/unit/search.repository.test.ts
```

### ملفات معدَّلة (تعديل جزئي على ملف موجود)
```
backend/src/routes.ts
```
— إضافة `import { searchRouter } from './modules/search'` وسطر
`router.use('/search', searchRouter)` مكان تعليق A-05 القديم.

```
backend/src/middlewares/rateLimit.middleware.ts
```
— إضافة `searchSuggestionsRateLimit` في نهاية الملف (limiter جديد
لمسار الـ autocomplete).

```
backend/src/modules/ads/ads.repository.ts
```
— **تعديل دقيق وحرج**: إضافة `coalesce(...)` حول عمود `description`
داخل تعبير full-text search الموجود مسبقاً (كان `to_tsvector('simple',
"description")`, أصبح `to_tsvector('simple', coalesce("description",
''))`). ضروري ليطابق تعبير هذا الاستعلام فهرس `ads_search_idx` الجديد
حرفياً — بدونه الفهرس الجديد لن يُستخدَم أبداً من قبل بحث الإعلانات
الحالي. **لا يغيّر أي نتيجة** (description عمود NOT NULL أصلاً).

## Frontend

### ملفات جديدة بالكامل
```
frontend/types/search.types.ts
frontend/api/search.api.ts
frontend/hooks/queries/useSearch.ts
frontend/components/search/SearchBox.tsx
frontend/components/search/SearchTabs.tsx
frontend/components/search/SearchTabsWrapper.tsx
frontend/components/search/SearchFilters.tsx
frontend/components/search/SearchResults.tsx
frontend/components/search/SearchSuggestions.tsx
frontend/components/search/UnifiedResultCard.tsx
```

### ملفات معدَّلة
```
frontend/app/(public)/search/page.tsx
```
— استبدال كامل: كانت تستورد `components/ads/{SearchInput,
SearchFilters, SearchResults}` (بحث إعلانات فقط)، أصبحت تستورد
`components/search/*` الموحّدة الجديدة. **ملاحظة مهمة**: مكونات
`components/ads/Search*` القديمة **لم تُحذف ولم تُعدَّل** — لا تزال
تُستخدم في `app/(public)/categories/[slug]/page.tsx` لتصفح فئة إعلانات
واحدة، وهو استخدام مختلف تماماً عن صفحة البحث الموحّد.

```
frontend/lib/constants.ts
```
— إضافة مفتاحين إلى `CACHE_TTL`: `search` (30s) و`searchSuggestions`
(60s). لا حذف لأي مفتاح موجود.

```
frontend/lib/queryKeys.ts
```
— إضافة قسم `search: { unified, suggestions }` إلى كائن `queryKeys`.
لا حذف لأي قسم موجود.

## ملاحظة حول فرونت اند المحلات/المنتجات

كل ملفات `frontend/{types,api,hooks,components}/` الخاصة بـ
Products/Stores (المرفوعة سابقاً في `stores-frontend.zip`) **ليست
ضمن هذا الأرشيف** لأنها لم تُعدَّل في هذه الجولة — هذا الأرشيف يحتوي
فقط ما لمسه العمل على ميزة البحث الموحّد تحديداً.

## غير مكتمل بعد (بناءً على طلب تأجيل الاختبارات)

- `backend/tests/unit/search.service.test.ts`
- `backend/tests/integration/search.test.ts`
