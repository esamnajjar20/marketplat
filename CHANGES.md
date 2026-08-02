# إصلاحات تقرير الفحص — المشكلتان #1 و #2

هذه الحزمة تحتوي فقط على الملفات **المعدّلة** أو **الجديدة**، بنفس مسارات
المشروع الأصلي (`backend/...`, `frontend/...`) بحيث يمكن نسخها مباشرة فوق
نسخة `marketplat-main` الأصلية لدمج التعديلات.

---

## المشكلة #1 🔴 — لا توجد صفحة `/admin/stores`

**الجذر الحقيقي المكتشف أثناء الإصلاح:** التقرير افترض أن `updateStatus`
كافٍ لحل المشكلة، لكن الفحص كشف فجوة أعمق: **`GET /stores` العام في
الـ backend كان مُثبَّتًا (hardcoded) على `status: 'ACTIVE'`** في
`stores.repository.ts`، أي لم تكن هناك حتى وسيلة برمجية لعرض المتاجر
بحالة `PENDING` — لا للأدمن ولا لأي أحد. تطلّب الحل إضافة مسار admin
مخصص جديد، وليس فقط ربط الواجهة بمسار موجود.

### Backend (5 ملفات)

| الملف | التعديل |
|---|---|
| `backend/src/modules/stores/stores.repository.ts` | إضافة `findManyForAdmin()` — يدعم الفلترة بأي حالة (PENDING/ACTIVE/BLOCKED) + بحث نصي، بعكس `findMany` العام المثبّت على ACTIVE فقط |
| `backend/src/modules/stores/stores.validation.ts` | إضافة `adminGetStoresSchema` + `AdminGetStoresQuery` (page/limit/status/q) |
| `backend/src/modules/stores/stores.service.ts` | إضافة `getAllStores()` يستخدم الـ repository الجديد، بنفس نمط `sellersService.getAllSellers` |
| `backend/src/modules/stores/stores.controller.ts` | إضافة `getAllStores` controller |
| `backend/src/modules/admin/admin.routes.ts` | تسجيل `GET /admin/stores` و `PATCH /admin/stores/:id/status` (محمية بـ `authenticate` + `requireAdmin` عبر `adminRouter.use(...)`) |

تم التحقق من نجاح الترجمة (`tsc --noEmit`) بدون أي أخطاء ناتجة عن هذه التعديلات.

### Frontend (10 ملفات)

| الملف | التعديل |
|---|---|
| `frontend/types/admin.types.ts` | إضافة `AdminStore`, `AdminStoreStatus`, `AdminGetStoresParams`, `UpdateStoreStatusPayload` |
| `frontend/api/admin.api.ts` | إضافة `adminApi.getStores()` و `adminApi.updateStoreStatus()` |
| `frontend/lib/queryKeys.ts` | إضافة `queryKeys.admin.stores(params)` |
| `frontend/hooks/queries/useAdmin.ts` | إضافة `useAdminStores()` |
| `frontend/hooks/mutations/useAdminMutations.ts` | إضافة `useAdminUpdateStoreStatus()` — مع تحديث متفائل (optimistic update) وتراجع عند الخطأ، بنفس نمط `useAdminSetSellerSuspended` |
| `frontend/components/admin/AdminStoresTable.tsx` | **جديد** — جدول إدارة المتاجر: تبويبات فلترة بالحالة (قيد المراجعة/نشطة/محظورة/الكل)، بحث، إجراءات موافقة/حظر/رفع حظر، مع `ConfirmDialog` لإجراء الحظر (الإجراء الوحيد المؤثر على الظهور العام) |
| `frontend/app/(admin)/admin/stores/page.tsx` | **جديد** — الصفحة نفسها |
| `frontend/app/(admin)/admin/stores/loading.tsx` | **جديد** — هيكل التحميل (skeleton) |
| `frontend/components/admin/AdminSidebar.tsx` | إضافة رابط "المتاجر" في القائمة الجانبية للأدمن (يستخدم `ROUTES.admin.stores` الذي كان معرَّفًا مسبقًا في `constants.ts` لكن غير مستخدم) |
| `frontend/middleware.ts` | (مُدمَج هنا أيضًا لأنه يخص تجربة `/my-store`) إضافة `/my-store` إلى `PROTECTED_PREFIXES` — إصلاح المشكلة #9 من التقرير (سطر واحد) |

**النتيجة:** أي متجر جديد يُنشأ بحالة `PENDING` أصبح الآن مرئيًا لصفحة
`/admin/stores` (التبويب الافتراضي هو "قيد المراجعة")، ويمكن للأدمن
الموافقة عليه (→ ACTIVE) أو حظره (→ BLOCKED) بنقرة واحدة.

---

## المشكلة #2 🔴 — صفحة `/settings/service-provider` يتيمة

تأكّد أن الصفحة والمكوّن (`ServiceProviderSettingsSection`) وحتى المسار
`ROUTES.settings.serviceProvider` كانوا **جميعًا موجودين ومكتملين فعليًا**
— الفجوة الوحيدة كانت غياب الرابط في القائمة الجانبية للإعدادات.

### Frontend (1 ملف)

| الملف | التعديل |
|---|---|
| `frontend/components/profile/SettingsSidebar.tsx` | إضافة رابط "ملف مقدم الخدمة" (أيقونة `Wrench`) بين "ملف البائع" و"متجري" |

**النتيجة:** أصبح بإمكان أي مستخدم الوصول إلى `/settings/service-provider`
من قائمة الإعدادات مباشرة، دون الحاجة لمعرفة الرابط يدويًا.

---

## كيفية الدمج

انسخ محتوى هذه الحزمة فوق مجلد المشروع الأصلي (نفس الأسماء والمسارات)،
ثم على جهة الـ backend نفّذ فحص الأنواع:

```bash
cd backend && npx tsc --noEmit
```

وعلى جهة الـ frontend، بعد `npm install`، شغّل type-check أو build للتأكد:

```bash
cd frontend && npm run build
```

(لم يتوفر تشغيل `npm install`/build فعلي في بيئة الإصلاح بسبب تعطيل الشبكة،
لذا تم التحقق يدويًا من تطابق كل الاستيرادات والأنواع مع الأنماط الموجودة
في المشروع، وتم تشغيل `tsc --noEmit` بنجاح على جهة الـ backend فقط.)
