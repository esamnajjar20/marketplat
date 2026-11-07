# التقرير النهائي — تحسين كاش MarketPlat وCloudflare D1

**التاريخ:** 2026-11-06  
**النطاق:** API Worker، طبقة D1 المرجعية، إبطال الكاش، إعدادات Cron وAnalytics Engine، وربط Feature Flags بلوحة الإدارة.

## ملخص الحالة

اكتملت تعديلات المصدر المتاحة في هذه الحزمة، لكن لم يتم نشرها إلى Cloudflare أو Render ولم تُختبر ضد قاعدة D1 الإنتاجية. لذلك تُعد المراحل التالية مكتملة برمجياً أو جاهزة للتهيئة، لا مكتملة تشغيلياً حتى ينجح التحقق بعد النشر.

| المرحلة | حالة المصدر | شرط الإغلاق التشغيلي |
|---|---|---|
| 1. تخزين الاستعلامات المفلترة | مكتملة | مراقبة عدد المفاتيح والكتابات بعد النشر |
| 2. كاش صفحات التفاصيل والإبطال | مكتملة في المصدر | اختبار تعديل/حذف منتج وإعلان ومتجر وخدمة والتأكد من إزالة صفوف D1 المطابقة |
| 3. TTL طويل 24h/7d | جاهز ومحمي، معطّل افتراضياً | تفعيل purge والتحقق منه أولاً، ثم تشغيل المتغير ونشر Worker |
| 4. تخزين البحث بقائمة سماح | مكتملة | توسيع whitelist بناءً على مصطلحات بحث فعلية ومراقبة حجم المفاتيح |
| 5. Pre-warm والتنظيف المجدول | مجدول في الإعدادات | نشر Cron ثم التأكد من نجاح warm والتنظيف في سجلات الإنتاج |
| 6. Analytics وFeature Flags | ربط Cache Analytics وواجهة الإدارة مكتمل في المصدر | ضبط الأسرار ونشر العمال؛ ربط أي ميزة فعلية بالـ hook عند اعتمادها |

## التعديلات المنفذة

### المرحلة 1 — تخزين الاستعلامات المفلترة

- إزالة قيد `BASE_ONLY_KV_ROUTES` الذي كان يمنع تخزين بعض صيغ القوائم المفلترة.
- يستخدم المفتاح canonical معاملات الاستعلام بعد ترتيبها وتطبيعها.
- استبعاد cache-busters مثل `_t` و`t` و`timestamp` و`probe`.
- وضع حدود للمعاملات والقيم وطول المفتاح، ورفض القيم النصية الطويلة لـ `q`.
- تبقى المسارات خارج `REFERENCE_ROUTES` وغير المؤهلة خارج D1.

### المرحلة 2 — تفاصيل الكيانات

- مسارات التفاصيل كانت مؤهلة جزئياً للكاش في Worker قبل هذا التعديل؛ لم يُفترض أنها `no-store` بالكامل.
- أضيف preset `staticDetail` إلى سياسات الكاش المشتركة والمتزامنة في Shared/API/Frontend.
- يغطي الإعداد المنتجات والمتاجر وقوائم الخدمات ومقدمي الخدمات، مع الإبقاء على سياسة الإعلان القائمة.
- مدة المتصفح الافتراضية قصيرة، و`stale-while-revalidate` محدود. أما `s-maxage` فيرتبط بحالة تفعيل purge كما يوضح ملف سياسة الكاش.
- أضيفت وسوم للـ route والكيان والمدينة على صفوف D1 حتى يمكن إبطال الصفوف المرتبطة بالتعديل.

### المرحلة 3 — D1 invalidation وTTL (محدّث في المرحلة الأولى)

- جدول `d1_namespace` يحتفظ بوسوم `route_tag` و`entity_tag` و`city_tag` مع فهارسها.
- يجري تطهير Workers Cache وD1/KV كمحاولتين مستقلتين؛ فشل أحدهما لا يمنع محاولة الآخر.
- عند فشل عملية purge يرجع Worker `503` كي يستطيع الباكند إعادة المحاولة وفق آلية retry القائمة.
- رُفعت بادئة المفاتيح إلى `ref:v2:` حتى لا تُقرأ صفوف الإصدار السابق التي لا تحمل أعمدة الوسوم الجديدة.
- يبقى `REFERENCE_CACHE_PURGE_READY=false` و`REFERENCE_CACHE_LONG_TTL_ENABLED=false` افتراضياً؛ لذلك تتجاوز المسارات المتغيرة D1 حتى اكتمال التحقق من الإبطال.
- بعد ضبط `REFERENCE_CACHE_PURGE_READY=true` فقط، تدخل جميع مجموعات المسارات المرجعية المعروفة (بما فيها التصنيفات وأنواع المتاجر والخدمات) D1 بمدة 60 ثانية Fresh و10 دقائق كحد أقصى. سياسة ساعة Fresh و24 ساعة كحد أقصى هي قيمة احتياطية للمسارات المرجعية غير المصنفة، وليست مدة المسارات الحالية القابلة للتعديل.
- وضع 24 ساعة Fresh/7 أيام حد أقصى يحتاج تفعيل العلمين معاً، ويُترك مغلقاً حتى نجاح اختبار purge حي لكل أنواع المحتوى.

### المرحلة 4 — كاش البحث

- أضيفت قائمة سماح أولية للمصطلحات الشائعة، ويمكن توسيعها من المتغير `SEARCH_CACHE_WHITELIST` باستخدام `|` للفصل.
- الحماية تشمل `/api/v1/search` و`/api/v1/ads/search`، وكذلك معاملات `q` في القوائم التي تدعمها.
- الاستعلامات الحرة غير الموجودة في القائمة لا تُخزّن في D1؛ لا يجري إنشاء مفتاح لكل عبارة عشوائية.

### المرحلة 5 — Pre-warm وPurge المجدول

- إعداد Cron للتسخين كل 6 ساعات.
- يستخدم التسخين المسار المعتاد داخل Worker حتى يمر الطلب عبر طبقة التخزين المرجعية بدلاً من تجاوزها بطلب مباشر للمصدر.
- إعداد تنظيف يومي الساعة 03:30 UTC بحد أقصى 10,000 صف منتهي الصلاحية في كل تشغيل.
- التنظيف محصور ببادئة مفاتيح الكاش المرجعي `ref:v*`، ولا يحذف صفوفاً أخرى قد تشارك جدول D1.
- قائمة التسخين ثابتة ومحدودة لتجنب تسخين استعلامات غير مطلوبة أو استنزاف الحصة.

### المرحلة 6 — Analytics وFeature Flags

**Cache Analytics:**
- رُبط `CACHE_METRICS` بـ Workers Analytics Engine في `workers/cf-api-proxy/wrangler.toml` باستخدام dataset `marketplat_cache`.
- القياسات مخصصة لأداء الكاش: حالة HIT/MISS/STALE، المسار، Cloudflare Colo، زمن المصدر وحالة HTTP.
- لا يرسل هذا القياس معرّف مستخدم أو query string أو محتوى الرسالة، ولا ينفذ INSERT في D1 لكل طلب.

**تحليلات المنتج الحالية:**
- المشروع يحتوي أصلاً على `frontend/lib/analytics.ts` لتجميع أحداث المنتج في دفعات، وعلى مسار `/analytics/events` وملخص إداري في الباكند.
- لذلك لم يُنشأ سجل أحداث موازٍ في D1 لتجنب ازدواجية التسجيل واستهلاك حصص D1. يظل تحليـل سلوك المنتج في نظام Analytics القائم، بينما Analytics Engine الجديد يراقب أداء الكاش.

**Feature Flags:**
- أضيف جدول D1 باسم `feature_flags` وواجهة Worker خاصة للقراءة/التعديل.
- أضيفت حماية مستقلة `FEATURE_FLAGS_ADMIN_TOKEN` بطول لا يقل عن 32 محرفاً.
- أضيف Next Route Handler إداري يتحقق من جلسة المستخدم ومن دور `SUPER_ADMIN`، ويتحقق من Origin للكتابة، ويحد حجم الطلب والاستجابة.
- أضيفت صفحة `/admin?tab=feature-flags`، ولا تظهر إلا لـ `SUPER_ADMIN`.
- أضيف مسار عام يعرض مفاتيح `PUBLIC_` فقط، ولا يكشف المفاتيح الداخلية أو سر الإدارة.
- أضيف hook `usePublicFeatureFlag()` مع fallback آمن وتخزين قصير عبر React Query.
- إنشاء العلم أو تفعيله لا يربط ميزة تلقائياً؛ يجب أن يستدعي كود الميزة hook صراحةً. مفاتيح الأمان والخصوصية المحلية مثل `GPS_LOCATION` لم تُنقل إلى قناة التحكم البعيدة.
- لا يتضمن التنفيذ الحالي سجل تدقيق مستقل لمن غيّر كل علم؛ `updated_at` يسجل وقت آخر تعديل فقط.

## إعدادات النشر المطلوبة

### API Worker

من `workers/cf-api-proxy`:

```bash
npx wrangler secret put PURGE_TOKEN
npx wrangler secret put FEATURE_FLAGS_ADMIN_TOKEN
npx wrangler deploy
```

`FEATURE_FLAGS_ADMIN_TOKEN` يجب أن يكون سراً عشوائياً قوياً بطول 32 محرفاً على الأقل. لا تعِد استخدام `PURGE_TOKEN` أو `GATEWAY_ADMIN_TOKEN`.

### Frontend Worker

من مجلد `frontend`، اضبط **القيمة نفسها** لسر Feature Flags:

```bash
npx wrangler secret put FEATURE_FLAGS_ADMIN_TOKEN
```

تأكد من نشر إعداد `API_WORKER` Service Binding إلى API Worker الصحيح قبل اختبار صفحة الإدارة.

### Express API

في إعدادات Render/بيئة API:

```env
CF_CACHE_TAG_PURGE_ENABLED=true
EDGE_WORKER_PURGE_URL=https://<api-worker-host>/__purge__
EDGE_WORKER_PURGE_TOKEN=<نفس قيمة PURGE_TOKEN في API Worker>
```

لا تضبط `CF_CACHE_TAG_PURGE_ENABLED=true` قبل التأكد من نشر endpoint `/__purge__` وتشغيل عامل Outbox في API ووصوله إليه. يبقى كل من `REFERENCE_CACHE_PURGE_READY=false` و`REFERENCE_CACHE_LONG_TTL_ENABLED=false` حتى اكتمال الاختبار التالي. يجب أن يطابق `EDGE_WORKER_PURGE_TOKEN` قيمة `PURGE_TOKEN` وأن يكون طولها 32 حرفاً على الأقل.

## اختبارات ما بعد النشر — بوابة التفعيل

1. تحقق من أن API Worker يربط D1 binding `DB` وKV الاحتياطي إن كان مستخدماً، وأن Cron وAnalytics Engine ظاهران في إعداد النشر.
2. نفّذ طلب GET عاماً لمنتج معروف، ثم تحقق من إنشاء صف D1 بمفتاح يبدأ بـ `ref:v2:`.
3. عدّل المنتج من خلال API الحقيقي. تحقق من وصول طلب purge، ومن إزالة صف D1 المطابق للوسم `product:<id>`، ومن أن الطلب التالي يعيد بيانات المنتج المحدثة.
4. كرر الاختبار للإعلان والمتجر وقائمة الخدمة ومقدم الخدمة، مع اختبار الحذف أو الإخفاء حيثما ينطبق.
5. تحقق من سجلات Cron: تشغيل warm، وعدم تجاوز حد التنظيف، وعدم حذف مفاتيح D1 غير التابعة للبادئة `ref:v*`.
6. تحقق من ظهور نقاط في Analytics Engine، وقارن عدد الطلبات وحالات HIT/MISS ومتوسط زمن المصدر.
7. اختبر صفحة Feature Flags بحساب `SUPER_ADMIN`، وتأكد من رفض `ADMIN` و`MODERATOR`. أنشئ علماً `PUBLIC_...` وتأكد أن `/api/public/feature-flags` لا يعيد الأعلام الداخلية.
8. بعد نجاح الإبطال لكل الأنواع، اضبط `REFERENCE_CACHE_PURGE_READY=true` أولاً مع إبقاء TTL الطويل مغلقاً، اختبر مدة 60 ثانية/10 دقائق، ثم فعّل `REFERENCE_CACHE_LONG_TTL_ENABLED=true` فقط إن أثبتت المراقبة أن purge موثوق لكل المسارات.
9. راقب D1 Rows Written وStorage وCache Hit Ratio بعد 24 و72 ساعة. أوقف التوسع إذا اقترب الاستهلاك من عتبة التنبيه المتفق عليها أو زادت المفاتيح بلا عائد واضح.

## التحقق المحلي المنفذ

- `tsc --noEmit -p workers/cf-api-proxy/tsconfig.json`: ناجح.
- `node workers/cf-api-proxy/cache-policy.test.mjs`: ناجح، ويغطي سياسة الكاش، tagged D1/KV، الاستعلامات المفلترة، Cron، Feature Flags وAnalytics binding.
- `node frontend/scripts/navigation-integrity-audit.mjs`: ناجح، 26/26 فحصاً.
- تم فحص صياغة ملفات TypeScript/TSX المتغيرة باستخدام TypeScript transpile API.
- تم فحص صياغة `wrangler.toml` و`frontend/wrangler.jsonc` بعد إزالة التعليقات.
- اختبارات Vitest الكاملة و`next build` لم تُشغّل؛ اعتماديات Frontend غير موجودة في النسخة المرفقة.
- لم يُنفذ نشر فعلي أو اختبار حي على Cloudflare D1/Render. لا تعتبر المراحل التشغيلية مغلقة قبل تنفيذ بوابة التحقق أعلاه.

## أهم المسارات

- `workers/cf-api-proxy/worker.ts`
- `workers/cf-api-proxy/wrangler.toml`
- `apps/api/src/shared/cache/edgePurge.ts`
- `apps/api/src/middlewares/cacheControl.middleware.ts`
- `apps/api/.env.example`
- `frontend/app/api/admin/feature-flags/route.ts`
- `frontend/app/api/public/feature-flags/route.ts`
- `frontend/components/admin/AdminFeatureFlags.tsx`
- `frontend/hooks/usePublicFeatureFlag.ts`
- `frontend/lib/adminHubTabs.ts`
