# Edge cache — الجولة الثانية (البنود 7–12)

| # | البند | الحالة | أين |
|---|---|---|---|
| 7 | Cache-Key Normalization | ✅ | `workers/cf-api-proxy/worker.js` |
| 12 | SWR كامل على الـ Edge | ✅ | `worker.js` |
| 9 | Negative caching (404، 60s) | ✅ | `worker.js` |
| 8 | Cache-Tag Purge | ✅ (يعمل عند ضبط env) | `worker.js` + `backend/src/shared/cache/edgePurge.ts` + `ads.cache.keys.ts` |
| 10 | Edge KV للتصنيفات | ✅ (يعمل عند ربط KV) | `worker.js`, `wrangler.example.jsonc` |
| 11 | static / personal في /home | ✅ | `GET /home/static` + الواجهة |

## ما تغيّر
- **تطبيع المفاتيح**: ترتيب البارامترات، NFC + ترميز موحّد، إسقاط utm/fbclid/gclid، إزالة `/` الأخيرة، تثبيت الـ host. النسخة `v2→v3` (تُبطل المخزّن القديم).
- **SWR**: بعد s-maxage وخلال نافذة stale يُقدَّم المخزّن فوراً ويُحدَّث بالخلفية (ETag → 304 يجدّد المؤقّت). stale-on-error باقٍ.
- **Negative cache**: 404 لمسارات التفاصيل فقط (`/ads/:id`…)، JSON وأقل من 4KB، 60s، لا stale.
- **Purge**: الـ Worker يضع `Cache-Tag` (`route:`, `ad:<id>`, `city:<enc>`, `city:any`). الباك-إند يمسح بعد إبطال Redis، مع تجميع 1s وحد 30 وسماً/طلب وإعادة محاولة. نقاط الربط: إنشاء/تعديل/بيع/حذف/صور/إعادة نشر/admin. بدون `CF_PURGE_*` لا يتغير شيء.
- **رفع TTL**: `CACHE.ADS_LIST` (600s) و`CACHE.ADS_DETAIL` (3600s) لمسارات `/ads` فقط وفقط عند تفعيل الـ purge. المنتجات/المتاجر/الخدمات لم تُرفع (لا purge لها).
- **KV**: Cache API → KV (طازج 15د، يُخدَم stale حتى 24س مع تحديث خلفي) → origin. مسح عبر `POST /__purge__` عند تعديل التصنيفات/الأنواع. لا يوجد endpoint للمدن (قائمة ثابتة بالكود) فلا حاجة لها.
- **/home**: `/home/static` عام (guest) و`/home/feed` (= `/home/for-you`) خاص. الزائر المجهول كان يستدعي `/home/feed` الخاص فلا يصل للـ Edge أبداً؛ الآن يستخدم `/static` (hook + SSR prefetch + edgeProxy + SW). `CACHE_VERSION` v63→v64.

## أخطاء وُجدت وأُصلحت
1. الـ warm كان يكتب بمفتاح host مختلف (`onrender.com`) عن مفاتيح الطلبات → لم يكن يُصيب أبداً.
2. الـ single-flight كان يشارك `Response` مستهلك الـ body بين الطلبات المتزامنة.
3. الـ Worker كان يستبدل `Cache-Control` ويحذف `max-age` المتصفح؛ الآن يُحفظ (30s كما صُمّم).

## ⚠️ يجب التحقق قبل التفعيل
- **Purge بالـ Tag يتطلب Worker على zone خاصتك (Route)**. على `*.workers.dev` الـ Cache API لا يخدم ولا يمكن مسحه. لا تضبط `CF_PURGE_*` قبل التأكد.
- بعد التفعيل: انشر إعلاناً، اطلب تفاصيله مرتين (HIT)، علّمه مباعاً، اطلبه ثانية → يجب `MISS`.
- كل تعديل إعلان يمسح `city:any` (كل القوائم غير المفلترة) — ثمن اللحاق بالتحديث الفوري؛ راقب HIT ratio بعد التفعيل.
- نفّذتُ البنود معاً بطلبك، والتوصية الأصلية كانت واحداً تلو الآخر بعد 7 أيام قياس: فعّل بالترتيب (Worker ← KV ← PURGE).
- لم أستطع تشغيل jest/vitest/tsc (لا node_modules/شبكة). شُغّل فعلياً: اختبار الـ Worker كاملاً (مع mutation testing)، ومنطق `edgePurge.ts` بعد نزع الأنواع، وفحص صياغة كل الملفات. شغّل `npm test` في المجلدين.

## النشر
1. انشر الـ Worker (+ KV + `PURGE_TOKEN` اختيارياً). 2. انشر الباك-إند والواجهة. 3. لاحقاً اضبط `CF_PURGE_*`.
