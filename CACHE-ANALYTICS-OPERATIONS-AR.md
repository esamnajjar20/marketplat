# تشغيل Cache Analytics وFeature Flags في MarketPlat

هذا الدليل يشرح إعداد الميزات المضافة في Worker والواجهة الإدارية، والتمييز بين تحليلات الكاش وتحليلات سلوك المنتج الموجودة مسبقاً.

## 1. Cache Analytics Engine

يحتوي `workers/cf-api-proxy/wrangler.toml` على:

```toml
[[analytics_engine_datasets]]
binding = "CACHE_METRICS"
dataset = "marketplat_cache"
```

يسجل Worker نقاطاً لمراقبة الكاش المؤهل، وتتضمن:

| الحقل | الاستخدام |
|---|---|
| `blob1` | حالة الكاش، مثل HIT وMISS وSTALE |
| `blob2` | مسار API العام |
| `blob3` | Cloudflare Colo |
| `double1` | زمن المصدر بالميلي ثانية |
| `double2` | HTTP status |
| `index1` | مفتاح أخذ العينات المرتبط بالمسار |

لا يتضمن التسجيل user ID أو query string أو محتوى الطلب. كما أنه لا يضيف عملية INSERT إلى D1 لكل طلب.

### SQL أمثلة

توزيع حالات الكاش خلال آخر 24 ساعة:

```sql
SELECT blob1 AS cache_status,
       SUM(_sample_interval) AS requests
FROM marketplat_cache
WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY cache_status
ORDER BY requests DESC
```

الطلبات ومتوسط زمن المصدر حسب المسار والحالة:

```sql
SELECT blob2 AS route,
       blob1 AS cache_status,
       SUM(_sample_interval) AS requests,
       SUM(_sample_interval * double1) / SUM(_sample_interval) AS avg_upstream_ms
FROM marketplat_cache
WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY route, cache_status
ORDER BY requests DESC
LIMIT 100
```

أخطاء HTTP 5xx:

```sql
SELECT blob2 AS route,
       double2 AS http_status,
       SUM(_sample_interval) AS requests
FROM marketplat_cache
WHERE timestamp > NOW() - INTERVAL '1' DAY
  AND double2 >= 500
GROUP BY route, http_status
ORDER BY requests DESC
LIMIT 100
```

قد يستخدم Analytics Engine أخذ عينات؛ استخدم `_sample_interval` عند تجميع عدد الطلبات. تحتاج واجهة SQL API إلى Account ID ورمز API يملك صلاحية قراءة Analytics. لا تضع الرمز في Worker أو Frontend.

## 2. تحليلات سلوك المنتج الموجودة في التطبيق

لا تنشئ جدول D1 موازياً لتسجيل `view` و`click` قبل مراجعة النظام القائم. المشروع يحتوي مسبقاً على:

- `frontend/lib/analytics.ts` لتجميع أحداث المنتج في الذاكرة وإرسالها على دفعات.
- `POST /analytics/events` في الباكند لاستقبال الأحداث.
- `GET /admin/analytics/summary` لملخص التحليلات الإداري.

هذه منظومة مستقلة عن `marketplat_cache`؛ الأولى لتحليلات سلوك السوق، والثانية لقياس أداء طبقة الكاش. الحفاظ على الفصل يمنع تكرار الأحداث في قاعدتين.

## 3. Feature Flags

### مخطط الجدول

ينشئ API Worker جدول D1 تلقائياً عند أول استخدام:

```sql
CREATE TABLE IF NOT EXISTS feature_flags (
  name TEXT PRIMARY KEY NOT NULL,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  updated_at INTEGER NOT NULL
);
```

### أسرار الربط

أنشئ قيمة عشوائية قوية بطول 32 محرفاً على الأقل، واضبط القيمة نفسها على API Worker وFrontend Worker:

```bash
# داخل workers/cf-api-proxy
npx wrangler secret put FEATURE_FLAGS_ADMIN_TOKEN

# داخل frontend
npx wrangler secret put FEATURE_FLAGS_ADMIN_TOKEN
```

لا تضعها في `NEXT_PUBLIC_` أو أي ملف يُرسل إلى العميل. Frontend Route Handler يمرر السر إلى API Worker عبر Service Binding فقط.

### واجهة الإدارة

1. افتح `/admin?tab=feature-flags` بحساب `SUPER_ADMIN`.
2. أضف أسماء عامة تبدأ بـ `PUBLIC_`، مثل `PUBLIC_NEW_HOME_FEED`.
3. يبدأ المفتاح الجديد معطلاً.
4. فعّل أو أوقف المفتاح من الصفحة.
5. لا يستطيع `ADMIN` أو `MODERATOR` فتح صفحة الإدارة أو استدعاء Route Handler بنجاح.

### مسارات الخدمة

- الواجهة الإدارية في Next: `/api/admin/feature-flags`.
- القراءة العامة في Next: `/api/public/feature-flags`.
- Worker الإداري الداخلي: `/__gateway/feature-flags`، محمي بـ `x-feature-flags-token`.
- Worker العام: `/__gateway/public-feature-flags`، قراءة GET فقط ويعيد المفاتيح التي تبدأ بـ `PUBLIC_`.

### استخدام العلم في React

```tsx
import { usePublicFeatureFlag } from '@/hooks/usePublicFeatureFlag';

function NewHomeEntry() {
  const enabled = usePublicFeatureFlag('PUBLIC_NEW_HOME_FEED', false);
  return enabled ? <NewHomeFeed /> : <CurrentHomeFeed />;
}
```

الـ hook يستخدم TanStack Query مع `staleTime` قدره 30 ثانية و`gcTime` قدره 5 دقائق، ويعيد fallback محلياً إذا تعذرت القراءة. إنشاء العلم في D1 لا يفعّل مكوناً تلقائياً؛ على كود الميزة استدعاء hook صراحةً. لا تستخدم قناة الأعلام العامة للتحكم بمفاتيح الخصوصية أو السلامة مثل `GPS_LOCATION`.

### القناة الداخلية للتشغيل

```bash
curl -sS 'https://<API_WORKER_HOST>/__gateway/feature-flags' \
  -H 'x-feature-flags-token: <FEATURE_FLAGS_ADMIN_TOKEN>'
```

لا تستدعِ المسار الإداري من كود المتصفح.

## 4. بوابة تفعيل TTL الطويل

يبقى `REFERENCE_CACHE_LONG_TTL_ENABLED=false` حتى يتحقق كل ما يلي:

- API Worker منشور وD1 binding متاح.
- `PURGE_TOKEN` مضبوط في API Worker.
- في API/Render: `CF_CACHE_TAG_PURGE_ENABLED=true`، و`EDGE_WORKER_PURGE_URL` يشير إلى `/__purge__`، و`EDGE_WORKER_PURGE_TOKEN` يطابق `PURGE_TOKEN`.
- تعديل سجل عام فعلي يؤدي إلى purge ناجح ويزيل صف D1 الذي يحمل وسم الكيان.
- تكرار الاختبار على المنتجات والإعلانات والمتاجر والخدمات ومقدمي الخدمات.

بعد نجاح الاختبارات فقط، غيّر `REFERENCE_CACHE_LONG_TTL_ENABLED` إلى `true` وانشر API Worker.

## 5. مراجعة ما بعد النشر

- تحقق من ظهور نقاط `marketplat_cache` بعد طلبات API مؤهلة.
- راقب توزيع HIT/MISS/STALE ومتوسط زمن المصدر وحالات 5xx.
- تحقق من Cron التسخين كل 6 ساعات ومن Cron تنظيف D1 اليومي الساعة 03:30 UTC.
- راقب D1 Rows Read/Written وStorage بعد 24 و72 ساعة.
- تحقق من `/api/public/feature-flags` وأنه لا يعرض أي مفتاح لا يبدأ بـ `PUBLIC_`.
- لا تفعّل TTL الطويل لمجرد نجاح بناء Worker؛ يلزم اختبار إبطال حي.
