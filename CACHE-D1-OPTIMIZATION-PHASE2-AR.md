# تقرير المرحلة الثانية — تاريخ صحة البوابة والتوزيع التدريجي للخصائص

## ملخص التنفيذ

استكملت هذه المرحلة جزأين من قائمة التحسينات، مع إبقاء قرارات التشغيل اللحظية خارج D1:

1. **تاريخ صحة Gateway في D1:** أضيف تصدير دوري كل 15 دقيقة من `GatewayHealthCoordinator` (Durable Object) إلى جدول `gateway_health_history` باستخدام `D1Database.batch()`، مع مفتاح يمنع تكرار صف الخادم في الفترة نفسها. يحتفظ الجدول بآخر 30 يومًا، ويحذف Cron اليومي البيانات الأقدم.
2. **Feature Flags بنسبة rollout:** أضيف الحقل `rollout_percent` (0–100)، مع ترقية إضافية تلقائية للجدول القديم، وواجهات القراءة والإدارة، وحقل الإدارة في لوحة `SUPER_ADMIN`، وتقييم cohort ثابت في `usePublicFeatureFlag()`.

## تاريخ صحة Gateway

- يبقى Durable Object `GATEWAY_HEALTH` مصدر الحقيقة للـ circuit breaker وقرارات اختيار الخادم وFailover.
- لا يُجرى أي استعلام D1 لاتخاذ قرار بشأن طلب المستخدم.
- كل ربع ساعة يقرأ Worker لقطة `/snapshot` من Durable Object، ثم يكتب صفوف الخوادم في دفعة D1 واحدة.
- عدد الخوادم في اللقطة محدود أصلًا بـ64 في المنسق، لذلك حد الدفعة الأقصى 64 statement.
- مفتاح الصف `(server_id, server_url, recorded_at)` يجعل إعادة تشغيل Cron في الربع نفسه عملية upsert بدل مضاعفة السجل.
- تخزن الأعمدة حالة الصحة، HTTP status، زمن الاستجابة، failures، open-until، quarantine، error rate، EWMA، sample count ومصدر العينة؛ ولا تخزن بيانات مستخدمين أو محتوى طلبات.
- التنظيف اليومي يحذف السجلات التي تجاوزت 30 يومًا.
- إذا لم يكن D1 أو Durable Object أو `batch()` متاحًا، يتخطى التصدير دون التأثير على طلبات API. فشل التصدير يسجل في Worker logs ولا يوقف التوجيه.

استعلامات تشغيلية مفيدة:

```sql
-- آخر عينات كل خادم
SELECT server_id, server_url, recorded_at, healthy, status,
       duration_ms, failures, error_rate, quarantined
FROM gateway_health_history
ORDER BY recorded_at DESC
LIMIT 100;

-- متوسط زمن الاستجابة ونسبة عدم الصحة لكل خادم خلال آخر 24 ساعة
SELECT server_id, server_url,
       ROUND(AVG(duration_ms), 1) AS avg_duration_ms,
       ROUND(AVG(CASE WHEN healthy = 0 THEN 1.0 ELSE 0.0 END), 4) AS unhealthy_ratio,
       MAX(failures) AS max_failures,
       COUNT(*) AS samples
FROM gateway_health_history
WHERE recorded_at >= unixepoch() - 86400
GROUP BY server_id, server_url
ORDER BY unhealthy_ratio DESC, avg_duration_ms DESC;
```

## Feature Flags و rollout_percent

- تمت إضافة `rollout_percent INTEGER NOT NULL DEFAULT 100` مع قيد المجال 0–100.
- عند أول قراءة/كتابة لجدول `feature_flags`، يتحقق Worker من المخطط ويضيف العمود للتركيبات القديمة دون حذف أو إعادة إنشاء السجلات.
- يستقبل مسار الإدارة `rolloutPercent` اختياريًا؛ القيمة الافتراضية 100 للتوافق مع الطلبات القديمة.
- تعرض لوحة `SUPER_ADMIN` نسبة التوزيع ويمكن تعديلها مستقلًا عن زر التفعيل.
- يعرض endpoint العام `PUBLIC_*` كائنًا بالشكل `{ enabled, rolloutPercent }` بدل قيمة boolean فقط.
- `usePublicFeatureFlag(name, fallback, subject)` يستخدم hash ثابتًا لمعرّف subject كي يبقى المستخدم ضمن المجموعة نفسها. عند rollout جزئي يجب تمرير معرّف ثابت غير سري (مثل user ID الداخلي)، وبدون subject تكون النتيجة مغلقة. نسبة 100 لا تحتاج subject.
- لا توجد في المشروع الحالي استدعاءات تشغيلية أخرى للـ hook؛ لذلك أُنجزت آلية التوزيع وواجهة إدارتها، لكن تفعيلها على ميزة بعينها يتطلب أن يستدعي مكوّن تلك الميزة الـ hook ويمرر subject مناسبًا.

## ما تحقق من قائمة الخطة الأوسع

| البند | الحالة بعد هذه المرحلة |
|---|---|
| TTL 24 ساعة / 7 أيام | موجود من المرحلة الأولى، لكنه opt-in ومعطّل حتى التحقق من إعداد التطهير في API وWorker |
| توسيع المسارات العامة | المرحلة الأولى أضافت مسارات عامة فعلية؛ لم أضف مسارات افتراضية. `/public/stores/:slug/stats` موجود أصلًا، وترتيب البائعين متاح، وطلبات التصفّح الشخصية تبقى خارج الكاش المشترك |
| Sitemap / RSS | `/sitemap.xml` موجود في Next.js ويستخدم `revalidate = 21600` (6 ساعات). لم أجد RSS قائمًا كي أضيف له سياسة كاش |
| Search whitelist | سقف 500 مصطلح مع الإعداد الاختياري موجود من المرحلة الأولى |
| صفحات القوائم | مفاتيح URL المستقلة تعزل query/page؛ لا نسخ تسخين مسبق لمئات الصفحات |
| العناصر ذات الصلة والتوصيات | `GET /ads/:id/related` موجود ويستفيد من سياسة كاش الإعلانات. لا يوجد مسار منتج `/:id/related`. `GET /recommendations` شخصي محتملًا وموسوم `CACHE.NONE` عمدًا، فلا يدخل الكاش المشترك |
| تاريخ صحة Gateway | أُنجز في هذه المرحلة عبر D1 batch كل 15 دقيقة |
| Analytics مجمّع في D1 | لم أنقله إلى D1؛ أبقيت Workers Analytics Engine (`CACHE_METRICS`) لقياس cache HIT/MISS ووقت upstream دون كتابة D1 لكل طلب. لم أضف عدادات D1 لحظية مكلفة |
| rollout_percent | أُنجزت البنية والتخزين وواجهة الإدارة ودالة تطبيق cohort |
| City aggregates | لم أنفذها؛ لا يوجد في المسارات المفحوصة endpoint موحد ومثبت لمجاميع المدينة. يجب تحديد تعريف الأعداد (إعلانات فعالة؟ منتجات؟ خدمات؟) ومصدرها قبل تخزين snapshot كي لا تنشأ أرقام غير متطابقة مع قواعد النشاط والخصوصية |

## الملفات المعدلة

- `workers/cf-api-proxy/worker.ts`
- `workers/cf-api-proxy/src/types.ts`
- `workers/cf-api-proxy/cache-policy.test.mjs`
- `workers/cf-api-proxy/wrangler.toml`
- `workers/cf-api-proxy/wrangler.example.jsonc`
- `frontend/app/api/admin/feature-flags/route.ts`
- `frontend/components/admin/AdminFeatureFlags.tsx`
- `frontend/hooks/usePublicFeatureFlag.ts`
- `frontend/lib/publicFeatureFlags.ts`
- `frontend/__tests__/unit/api/admin-feature-flags-route.test.ts`
- `frontend/__tests__/unit/api/public-feature-flags-route.test.ts`
- إضافة `frontend/__tests__/unit/lib/publicFeatureFlags.test.ts`

## نتائج التحقق

- `tsc --noEmit -p workers/cf-api-proxy/tsconfig.json`: نجح.
- بناء Worker بواسطة `tsc -p workers/cf-api-proxy/tsconfig.json`: نجح.
- `node workers/cf-api-proxy/cache-policy.test.mjs`: نجح، بما يشمل اختبارات rollout، ترقية مخطط Feature Flags القديم، ودفعة تاريخ الصحة في D1.
- فحص صياغة TypeScript/TSX للملفات الأمامية المعدلة: نجح.
- لم تُشغّل Vitest أو `next build` للواجهة لغياب `frontend/node_modules` في بيئة الفحص.
- لم يُنفذ نشر حي، ولم يُختبر D1 الحقيقي أو Cron على Cloudflare؛ الاختبارات تستخدم D1 وDO mocks.

## خطوات النشر

1. ارفع ملفات الحزمة إلى المشروع مع الحفاظ على المسارات.
2. انشر API Worker بالإعداد الجديد للـ Cron. لا يلزم تنفيذ SQL يدويًا؛ Worker ينشئ جدول التاريخ ويضيف عمود rollout عند الحاجة.
3. تحقق من ظهور `gateway_health_history` في D1 بعد أول تشغيل Cron كل 15 دقيقة. إذا لم يوجد أي server state في Durable Object فلن تُكتب صفوف حتى تظهر حالة فعلية.
4. تحقق من أن لوحة Feature Flags تعرض `rolloutPercent` وتستطيع حفظ 0 و100 ونسب وسطية.
5. لا تفعّل TTL الطويل حتى يثبت اختبار purge end-to-end في بيئة الإنتاج. هذه المرحلة لا تغير مفتاح `REFERENCE_CACHE_LONG_TTL_ENABLED`.

**حدود التسليم:** هذه حزمة تعديلات مصدرية وليست نشرًا للإنتاج. لم أغير Durable Object إلى D1، ولم أنفذ City Aggregates أو D1 cache analytics.
