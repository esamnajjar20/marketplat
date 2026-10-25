# فجوة #7 — نظام تحليلات سلوك المستخدم (Product Analytics)

هاي الملفات جاهزة لدمجها بمشروعك — كل ملف بنفس مساره النسبي داخل
`apps/api/` أو `apps/web/`. انسخهم فوق البنية الأصلية (استبدال للملفات
المعدّلة، إضافة للجديدة).

جميع أنواع الأحداث السبعة مربوطة الآن فعليًا:
`PAGE_VIEW`، `AD_VIEW`، `SEARCH`، `CATEGORY_BROWSE`، `CONTACT_CLICK`،
`SIGNUP_STARTED`، `SIGNUP_COMPLETED`.

## ملفات جديدة بالكامل

**Backend:**
- `apps/api/prisma/migrations/20260806120000_add_analytics_events/migration.sql`
- `apps/api/src/modules/analytics/` (كامل: controller, repository,
  routes, service, validation, index)

**Frontend:**
- `apps/web/lib/analytics.ts` — tracker خفيف من طرف العميل (session id،
  batching، sendBeacon عند مغادرة الصفحة)
- `apps/web/api/analytics.api.ts` — استدعاء ملخص الأدمن
- `apps/web/components/admin/AdminAnalyticsDashboard.tsx` — لوحة
  التحليلات (بطاقات ملخص، معدلات تحويل، رسم بياني بسيط، أكثر الفئات
  تصفحًا)
- `apps/web/components/shared/PageViewTracker.tsx` — تتبع `PAGE_VIEW`
  على مستوى كل الموقع (مستثنى: مسارات `/admin`)
- `apps/web/app/(admin)/admin/analytics/page.tsx`
- `apps/web/app/(admin)/admin/analytics/loading.tsx`

## ملفات معدّلة (استبدال كامل)

**Backend:**
- `apps/api/prisma/schema.prisma` — أضيف موديل `AnalyticsEvent` +
  enum `AnalyticsEventType`
- `apps/api/src/middlewares/rateLimit.middleware.ts` — أضيف
  `analyticsEventsRateLimit`
- `apps/api/src/routes.ts` — ربط `/analytics` و `/admin/analytics`

**Frontend:**
- `apps/web/components/ads/AdDetailSection.tsx` — تتبع `AD_VIEW`
- `apps/web/components/ads/SellerCard.tsx` — تتبع `CONTACT_CLICK`
- `apps/web/components/search/SearchResults.tsx` — تتبع `SEARCH`
- `apps/web/components/home/CategoryHero.tsx` — تتبع `CATEGORY_BROWSE`
- `apps/web/components/auth/RegisterForm.tsx` — تتبع `SIGNUP_STARTED`
- `apps/web/hooks/mutations/useAuthMutations.ts` — تتبع
  `SIGNUP_COMPLETED`
- `apps/web/hooks/queries/useAdmin.ts` — hook
  `useAdminAnalyticsSummary`
- `apps/web/lib/constants.ts` — `ROUTES.admin.analytics` +
  `CACHE_TTL.adminAnalytics`
- `apps/web/lib/queryKeys.ts` — `queryKeys.admin.analyticsSummary`
- `apps/web/components/admin/AdminSidebar.tsx` — رابط "التحليلات"
  بالقائمة الجانبية
- `apps/web/providers/AppProviders.tsx` — ربط `PageViewTracker`
  ليشتغل على كل صفحات الموقع (باستثناء `/admin`)

## خطوات ما بعد الدمج

1. `cd apps/api && npx prisma migrate deploy` (أو `migrate dev` بالتطوير)
   لتطبيق migration الجدول الجديد `analytics_events`
2. `npx prisma generate` لتحديث Prisma Client بموديل
   `AnalyticsEvent` والـ enum الجديد
3. تأكد من متغيرات البيئة الموجودة أصلاً كافية (لا توجد متغيرات
   بيئة جديدة مطلوبة لهذه الميزة)
4. لم يتم تشغيل `tsc`/build فعليًا على هذا الكود (لا تتوفر بيئة
   npm install بمكان التطوير) — راجعت كل ملف يدويًا لكن يُنصح
   بتشغيل `npm run build` و`npm test` على المشروع الفعلي قبل النشر

## نقاط تصميم يستاهل تعرفها

- **`POST /analytics/events` عام بدون auth إجباري** — عمدًا، لأن
  معظم تصفح المنصة من زوار غير مسجّلين. بيتعرف على `userId` لو موجود
  توكن صالح بالـ header، بدون ما يرفض الطلب لو مش موجود.
- **الفرونت اند tracker (`lib/analytics.ts`) ما بيستخدم `apiClient`
  العادي** — عمدًا، عشان فشل حدث تحليلات ما يفعّل session-expired
  flow (توست + تحويل لصفحة تسجيل الدخول).
- **`PageViewTracker` مستثني مسارات `/admin`** — تصفح الأدمن نفسه
  للوحة التحكم مش "استخدام منتج" بمعنى الفجوة الأصلية.
- **أسماء الفئات بالعربي** — الـ backend بيعمل lookup إضافي من جدول
  `Category` لتحويل `categoryId` الخام لاسم عربي بلوحة التحليلات.

## ما لم يُنفَّذ بعد (خارج نطاق هذا التسليم)

- اختبارات وحدة/تكامل لـ endpoints أو للـ tracker
- لا يوجد رسم بياني تفاعلي حقيقي (استُخدم CSS bar chart بسيط لعدم
  وجود مكتبة رسوم بيانية بالمشروع أصلاً — قرار تجنّب إضافة dependency
  جديدة لميزة واحدة)
