# تقرير تدقيق طلبات الصفحات العامة – MarketPlat

**التاريخ:** 8 نوفمبر 2026  
**نطاق العمل:** صفحات التصفح العامة، البحث، الفلاتر، تنقّل App Router، وطلبات بيانات القوائم.

## 1. ملخص تنفيذي

تمت مراجعة سجل الشبكة الذي أرسله المستخدم وربطه بمصادر الاستدعاء في الواجهة. نُفّذت تعديلات تستهدف الطلبات التي كانت تُطلق قبل أن يطلب المستخدم البيانات أو من مكونات مخفية، مع الإبقاء على طلبات المحتوى اللازمة ومسارات الاستعادة عند فشل التحميل المسبق.

التغييرات الأساسية:

1. احترام `prefetch={false}` وعدم إعادة تفعيله تلقائيًا عند hover أو focus. أصبح prefetch عند intent خيارًا صريحًا عبر `prefetchOnIntent`.
2. إزالة استعلام الإعلانات الإضافي من نافذة فلاتر الإعلانات؛ شبكة النتائج وحدها تملك بيانات الإعلانات والعدد.
3. تأجيل تحميل تصنيفات البحث حتى فتح «خيارات أكثر»، مع تحميل تصنيف النوع الموافق فقط عندما يكون نوع البحث محددًا.
4. عدم تركيب فلاتر الشريط الجانبي المخصص لسطح المكتب على الهاتف؛ عولج ذلك بمكوّن `DesktopOnly` متوافق مع SSR وhydration.
5. تأجيل أنواع المتاجر والخدمات حتى فتح قائمة الاختيار، ما لم يكن عنوان الصفحة يحتوي بالفعل على نوع محدد يحتاج اسمه أو بياناته.
6. صفحة الطلبات لا تطلب أنواع الخدمات عندما يكون النوع المختار ليس «خدمات»، ولا تطلبها قبل تركيز المستخدم على قائمة المجال، إلا عند وجود `serviceTypeId` في الرابط.

## 2. تفسير عناصر سجل الشبكة

| الطلب الظاهر في السجل | التصنيف | الإجراء / السبب |
|---|---|---|
| `GET /sellers/ranking?_rsc=...` مرتان | RSC / تنقّل | عدّلنا محوّل الروابط كي لا يحوّل `prefetch={false}` إلى prefetch عند hover أو focus دون opt-in. وجود `loading.tsx` يسمح في Next بجلب shell/جزء RSC أثناء prefetch ثم الصفحة الكاملة عند النقر؛ لذلك زوج RSC ليس بالضرورة طلب API مكررًا. يلزم إعادة القياس بعد النشر لتأكيد مقدار الانخفاض. |
| `GET /service-providers?_rsc=...` مرتان | RSC / تنقّل | نفس إصلاح سياسة prefetch. طلب `/api/v1/service-providers?...` نفسه هو بيانات مقدمي الخدمة حسب المدينة والصفحة، وهو طلب محتوى فعلي أبقيناه. |
| `GET /stores?_rsc=...` مرتان | RSC / تنقّل | نفس إصلاح سياسة prefetch. جلب المتاجر نفسه مطلوب لعرض صفحة المتاجر، لكن بيانات أنواع المتاجر أصبحت مؤجلة حتى الحاجة. |
| `GET /requests?_rsc=...` مرتان | RSC / تنقّل | نفس إصلاح سياسة prefetch. أبقينا طلب `/api/v1/requests` لأنه يغذي قائمة الطلبات المعروضة. |
| `GET /services?_rsc=...` مرتان | RSC / تنقّل | نفس إصلاح سياسة prefetch. أبقينا `/api/v1/service-listings` لأنه بيانات النتائج الفعلية. |
| `GET /products?_rsc=...` مرتان | RSC / تنقّل | نفس إصلاح سياسة prefetch؛ لم نحذف طلب بيانات المنتجات اللازمة للعرض. |
| `GET /ads?_rsc=...` مرتان | RSC / تنقّل | نفس إصلاح سياسة prefetch، بالإضافة إلى إزالة استعلام API ثانٍ مستقل كان يصدر من لوحة الفلاتر. |
| `GET /api/v1/ads?page=1&limit=10...` | محتوى فعلي | أبقيناه لأنه طلب قائمة الإعلانات المعروضة. |
| `GET /api/v1/ads?page=1&sortBy=...` بدون `limit` | تكرار مثبت | أزلناه من `SearchFiltersSheet`؛ كان يستخدم نسخة ثانية من `useAds` فقط لعرض عدد اختياري في زر/عنوان لوحة الفلاتر المغلقة. لم يكن مطلوبًا لعرض النتائج أو تشغيل الفلاتر. |
| `GET /api/v1/store-types` | بيانات فلتر مؤجلة | جعلناها لا تُحمّل عند دخول صفحة المتاجر إذا لم يحدد الرابط نوعًا ولم يفتح المستخدم قائمة «نوع المتجر». |
| `GET /api/v1/service-types` | بيانات فلتر مؤجلة | جعلناها لا تُحمّل قبل فتح اختيار مجال الخدمة، أو عند وجود مجال محدد في الرابط. وفي صفحة الطلبات لا تُحمّل إلا إذا كان النوع «خدمات» وكان المستخدم قد ركّز على القائمة، أو كان هناك مجال محدد مسبقًا. |
| `GET /api/v1/categories` | استخدام مرتبط بالحالة | قد يلزم عند عرض اقتراحات الفئات العليا في حالة عدم وجود نتائج بحث. لم نلغِ هذا الاستخدام المرئي. وفي شريط فلاتر البحث لا يُحمّل قبل فتح «خيارات أكثر». |
| `GET /api/v1/product-categories` و`GET /api/v1/service-categories` | بيانات فلاتر مؤجلة | لا تُطلب تلقائيًا من فلاتر البحث وهي مطوية؛ تُحمّل عند فتحها، وبحسب نوع البحث المختار. تبقى أماكن استخدامها المرئية الأخرى دون تعطيل. |
| `PATCH /api/v1/users/me/presence` | طلب خلفي لازم | أبقيناه؛ هو heartbeat لتحديث حضور المستخدم المسجل، وليس تحميلًا مكررًا للصفحة. يعمل وفق حالة المصادقة والظهور والاتصال. |
| `GET /api/v1/admin/developer-tools/setting` | طلب إداري مشروط | أبقيناه؛ مصدره وحدة أدوات المطورين التي لا تُركّب إلا بعد تحقق دور ADMIN/SUPER_ADMIN. لا يُطلب من زائر عام أو عضو عادي. |

## 3. التعديلات البرمجية

### سياسة RSC prefetch

- الملف: `components/navigation/IntentPrefetchLink.tsx`
- أضيف الخيار `prefetchOnIntent`، وقيمته الافتراضية `false`.
- عندما يحدد المستدعي `prefetch={false}` تبقى القيمة false عند المرور أو التركيز. لا يُسمح بالتحويل إلى `null` إلا عند تفعيل opt-in صريح.
- هذا يمنع محوّل الرابط من نقض سياسة المستدعي. لا يعني ذلك إلغاء prefetch القياسي للروابط التي لم تحدد `prefetch={false}`؛ سلوك Next الأصلي محفوظ.

### منع طلب الإعلانات المكرر

- الملف: `components/ads/SearchFiltersSheet.tsx`
- أزلنا استدعاءات `useAds` و`useSearchAds` و`useCategoryBySlug` من لوحة الفلاتر.
- أزلنا عدّاد النتائج الاختياري من زر لوحة الفلاتر؛ النتائج والعدد مصدرهما مكوّن النتائج فقط.
- تبقى حالة الفلاتر الفعلية مأخوذة من URL، وتظل عناصر التحكم تعمل عند فتح اللوحة.

### التحميل عند الطلب للتصنيفات والأنواع

- الملفات: `components/search/SearchFilters.tsx`, `components/stores/StoresFilters.tsx`, `components/services/ServiceCategoryFilter.tsx`, `components/requests/RequestFilters.tsx`.
- الملفات: `hooks/queries/useStoreTypes.ts`, `hooks/queries/useServiceTypes.ts`.
- أضيف خيار `enabled` اختياري للـ hooks مع بقاء السلوك الافتراضي السابق لكل المستدعين الآخرين.

### عدم تركيب الفلاتر المخفية

- ملف جديد: `components/shared/layout/DesktopOnly.tsx`.
- طُبّق في `components/shared/list/ListPageShell.tsx`، وصفحة البحث، وصفحة الفئة العامة.
- يستخدم `useSyncExternalStore` مع media query مطابق لحد Tailwind `lg` عند 1024px، وsnapshot متوافق مع SSR لتجنب اختلاف hydration.

## 4. ما لم نحذفه عمدًا

- طلبات بيانات القوائم الأساسية مثل الإعلانات والطلبات والخدمات ومقدمي الخدمة والمتاجر والمنتجات. هذه تغذي المحتوى الظاهر، أو تعمل كمسار fallback عندما لا تكون بيانات الخادم المسبقة متاحة/حديثة.
- طلب heartbeat للحضور للمستخدم المسجل.
- طلب إعداد أدوات المطورين الخاص بالمدير.
- تصنيفات الفئات التي تظهر فعليًا للمستخدم في أماكن أخرى، مثل اقتراحات البحث عند عدم وجود نتائج، شرائح فئات الخدمات، ونماذج الإنشاء.

وجود طلب في سجل المتصفح وحده لا يكفي لإثبات أن استدعاء API زائد؛ لا يظهر في هذا السجل إن كانت بيانات الصفحة قد وصلت مسبقًا من RSC أو HydrationBoundary، ولا يُظهر سبب إعادة التحقق أو cache freshness. لذلك لم نُزل fallback لطلبات القوائم.

## 5. الملفات المتأثرة

- `frontend/components/navigation/IntentPrefetchLink.tsx`
- `frontend/components/ads/SearchFiltersSheet.tsx`
- `frontend/components/search/SearchFilters.tsx`
- `frontend/components/search/SearchPageClient.tsx`
- `frontend/components/stores/StoresFilters.tsx`
- `frontend/components/services/ServiceCategoryFilter.tsx`
- `frontend/components/requests/RequestFilters.tsx`
- `frontend/components/shared/layout/DesktopOnly.tsx` (جديد)
- `frontend/components/shared/list/ListPageShell.tsx`
- `frontend/app/(public)/categories/[slug]/page.tsx`
- `frontend/hooks/queries/useStoreTypes.ts`
- `frontend/hooks/queries/useServiceTypes.ts`
- اختبارات وحدات مرتبطة في `frontend/__tests__/components/` و`frontend/__tests__/unit/navigation/`.
- `frontend/scripts/public-page-request-reduction-audit.mjs` (جديد)
- `frontend/package.json` (إضافة أمر التدقيق `public-pages:request-audit`).

## 6. التحقق

اجتازت الأوامر التالية في نسخة العمل:

- `node scripts/public-page-request-reduction-audit.mjs`
- `node scripts/prefetch-policy-audit.mjs`
- `node scripts/necessary-request-audit.mjs`
- `node scripts/network-request-monitor-audit.mjs` — 21/21
- `node scripts/server-prefetch-audit.mjs` — 9/9
- `node scripts/http-request-phase3-audit.mjs` — 15/15
- `node scripts/http-request-phase6-audit.mjs` — 9/9

**قيود التحقق:** الحزمة لا تحتوي `node_modules`، لذلك لم يتم تشغيل Vitest/Jest أو `tsc --noEmit` أو build فعلي. اجتياز تدقيقات AST والسكريبتات لا يساوي اجتياز اختبار وقت التشغيل. كما لم يتم تسجيل trace جديد من المتصفح بعد التعديل؛ لذا لا نقدّم رقمًا مختلقًا لنسبة الانخفاض.

## 7. طريقة التحقق بعد النشر

1. افتح أدوات الشبكة وامسح السجل قبل كل تجربة.
2. افتح `/search` دون فتح «خيارات أكثر»: يجب ألا تطلب فلاتر البحث تصنيفات المنتجات والخدمات. في حالة انعدام النتائج قد يُطلب `/categories` لاقتراحات الفئات العليا.
3. افتح `/ads` دون فتح لوحة الفلاتر: يجب أن يظهر طلب بيانات القائمة فقط، لا طلب ثانٍ بلا `limit` من لوحة الفلاتر.
4. افتح `/stores` ولا تفتح اختيار النوع: يجب ألا يصدر طلب `store-types` ما لم يكن `type` محددًا مسبقًا في URL.
5. افتح `/services` ولا تفتح مجال الخدمة: يجب ألا يصدر طلب `service-types` ما لم يكن `serviceTypeId` موجودًا مسبقًا في URL.
6. افتح `/requests` بنوع غير SERVICE: يجب ألا يصدر طلب `service-types`.
7. تنقّل باستخدام الروابط التي عليها `prefetch={false}` دون hover/focus مسبق، ثم قارن عدد طلبات RSC. يجب تقييمها على نفس الجهاز ونفس المسار ونفس طريقة التفاعل.

---

**الخلاصة:** أزلنا التكرار المثبت وأجّلنا البيانات غير المطلوبة إلى لحظة الحاجة، ولم نحذف طلبات المحتوى أو fallback لمجرد ظهورها في سجل الشبكة.
