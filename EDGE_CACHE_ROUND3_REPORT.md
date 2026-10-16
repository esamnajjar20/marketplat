# Edge cache — الجولة الثالثة (فحص عميق وتصليب)

الملف تراكمي: يحتوي كل تعديلات الجولتين على النسخة الأصلية.

## ثغرات صحة البيانات (الأخطر)
مسارات تُخفي/تغيّر إعلاناً **ولا تُبطل أي كاش** (لا Redis ولا Edge). كانت تتعافى بعد hard TTL (حتى 600s للقوائم المسخّنة)، وكانت ستصبح **ساعة كاملة** على الـ Edge مع تفعيل الـ purge:

| المسار | النتيجة السابقة | الآن |
|---|---|---|
| `scripts/expireAds.ts` (انتهاء الصلاحية) | يبقى الإعلان المنتهي ظاهراً | hide + purge ثم flush وإغلاق Redis |
| `reports.service` (إخفاء تلقائي بعد 3 بلاغات) | يبقى ظاهراً | hide |
| `fraud.service` (علم تلقائي / يدوي) | يبقى ظاهراً | hide |
| `fraud.clearAdFlag` | لا يعود فوراً | يعود (create) |
| `ads-pin.service` (تثبيت/إلغاء) | الترتيب قديم | soft + purge للمدينة |
| `demoteStaleAdBoosts` | ترتيب قديم | soft + purge |

## انحراف السياسة (كان يكسر `cache-layer-audit`)
الجولة الأولى عدّلت نسخة الباك-إند فقط من `cache-policy.json`. المصدر الوحيد هو `shared/cache-policy.json`؛ عدّلته ثم شغّلت `sync-cache-policy.mjs` فتطابقت النسخ الأربع وولّد `public/cache-policy.js`. اختبارات `cacheControl` القديمة التي كانت تتوقع بلا `s-maxage` صُحّحت. التدقيق الآن: `CACHE W1-W9 AUDIT PASSED`.

## تصليب الـ Worker
- **حماية من كسر الكاش**: أكثر من 16 بارامتر أو مفتاح > 1024 حرفاً ⇒ `BYPASS-SHAPE` (لا يُخزَّن).
- **keep-warm ذكي**: لا يلمس الـ origin ما دام المدخل أقل من 50% من عمره (`FRESH`) — كان يجلب 13 مساراً كل 4 دقائق بلا داعٍ.
- **`/__warm__`** يتطلب `x-purge-token` إذا ضُبط `PURGE_TOKEN` (كان مفتوحاً ويضخّم الطلبات للـ origin).
- **قياس حقيقي**: ربط اختياري `CACHE_METRICS` (Analytics Engine) + `cache-probe.mjs` للقياس من الخارج.

## CI
job جديد `edge-cache` (بلا تبعيات): اختبار الـ Worker + تأكيد تزامن نسخ السياسة + `cache-layer-audit`. لم يكن أي منها في الـ CI.

## كيف تقيس الآن (الخطوة الأهم)
```
node workers/cf-api-proxy/cache-probe.mjs https://<نطاق-الـAPI> 3
```
أغلبية HIT/STALE من الجولة 2 = سليم. أغلبية MISS أو `BYPASS-POLICY` = الـ Cache API لا يخزّن (غالباً `workers.dev`).
بعد ربط `CACHE_METRICS`:
```sql
SELECT blob1 AS status, blob2 AS route, count() AS n
FROM marketplat_cache WHERE timestamp > NOW() - INTERVAL '1' DAY
GROUP BY status, route ORDER BY n DESC
```
نسبة النجاح = (HIT + STALE + KV-HIT + KV-STALE + SHARED) / الكل.

## ما لم أستطع إصلاحه (حدود حقيقية)
- Cache API **محلي لكل مركز بيانات**؛ مع زوار قليلين كل مركز يبدأ بارداً، وتسخين cron يسخّن مركزاً واحداً فقط. لا حل برمجي بسيط؛ القياس سيُظهر حجم الأثر.
- مفاتيح الـ purge تحتاج Route على نطاقك (ليس workers.dev).
- بارامترات "مشروعة" بقيم عشوائية (مثل `q=`) تبقى MISS؛ الحماية منها على مستوى rate-limit الأصل.
- لم أستطع تشغيل jest/vitest/tsc هنا (لا node_modules/شبكة). شُغّل فعلاً: اختبار الـ Worker كاملاً مع mutation testing، منطق `edgePurge.ts`، تدقيق الكاش، وفحص صياغة كل الملفات.
