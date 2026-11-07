# تقرير المرحلة الأولى — تحسين D1 وCloudflare Cache

**التاريخ:** 2026-11-06  
**النطاق:** أول دفعة تنفيذية من خطة تحسين استهلاك D1 وتقليل طلبات الأصل، على نسخة المشروع المرفقة.

## ما تم تنفيذه

1. **TTL:** المسارات المرجعية غير المصنفة لها قيمة احتياطية ساعة freshness وحد أقصى 24 ساعة؛ أما المسارات المعروفة القابلة للتعديل، بما فيها التصنيفات والأنواع، فتتطلب جاهزية الإبطال. المسارات المتغيرة لا تدخل D1 قبل `REFERENCE_CACHE_PURGE_READY=true` وسر `PURGE_TOKEN` صحيح؛ وبعد الجاهزية تستخدم 60 ثانية freshness و10 دقائق حداً أقصى. الوضع الطويل 24 ساعة/7 أيام يحتاج كذلك `REFERENCE_CACHE_LONG_TTL_ENABLED=true` ويظل مغلقاً افتراضياً. وجود السر وحده لا يثبت تشغيل عامل Outbox أو نجاح purge الحي.
2. **توسيع المسارات العامة:** أضيفت مسارات موجودة فعليًا إلى Worker Cache: `/api/v1/badges` و`/api/v1/collections` و`/api/v1/public/stores` و`/api/v1/service-reviews`. التخزين لا يُفرض؛ يعتمد على `Cache-Control` العام الصادر من Express، وتبقى الطلبات التي تحمل Authorization أو Cookie خارج الكاش المشترك.
3. **إبطال الكاش:** توسعت وسوم الإبطال في API حتى تُبطل تغييرات المنتجات والعروض والمجموعات مجموعات المتاجر، وتُبطل تغييرات المتاجر والبائعين والتقييمات والشهادات المسارات العامة ذات الصلة. أضيفت بادئة `seller:` لإبطال ملف البائع المفرد.
4. **D1 للمسارات المتغيرة:** أضيفت `collections` و`public` و`service-reviews` إلى مرشحي D1، لكنها تبقى مستبعدة افتراضياً حتى جاهزية purge الصريحة. يسمح لها بدخول D1 عند `REFERENCE_CACHE_PURGE_READY=true` مع السر الصحيح وتستخدم TTL قصيراً؛ الوضع الطويل لا يعمل إلا عند تفعيل العلمين معاً. `/badges` بقي Worker Cache فقط لأن مصادر بياناته متعددة وسريعة التغير.
5. **البحث:** أصبح `SEARCH_CACHE_WHITELIST` يقبل مصطلحات إضافية مفصولة بـ `|`، مع سقف موحّد 500 مصطلح شاملًا المصطلحات الافتراضية الـ11. لم تُضف 489 كلمة تخمينية؛ ينبغي اشتقاق القائمة الإضافية من تحليلات بحث مجهّلة.
6. **الصفحات:** أضيفت اختبارات تثبت أن `page=1` و`page=2` ينتجان مفتاحي كاش منفصلين. لا يتم تسخين كل الصفحات مسبقًا، لتجنب تضخيم مفاتيح D1.
7. **التسخين:** أضيف ترتيب البائعين `/api/v1/sellers/ranking?limit=20` إلى مسارات التسخين المجدولة، فأصبح عدد المسارات 12.

## ما لم يُنفّذ في هذه المرحلة

- لم يُنشأ RSS؛ لم يُعثر على مسار RSS في شجرة API المفحوصة.
- Sitemap موجود أصلًا في `frontend/app/sitemap.ts` ويستخدم إعادة تحقق بمقدار 6 ساعات؛ لم يتغير في هذه الدفعة.
- لا يوجد مسار API مستقل للمنتجات ذات الصلة `/:id/related`. التوصيات العامة موجودة، لكنها قد تكون مخصصة للمستخدم ولذلك بقيت خارج الكاش المشترك، وكذلك `/home/feed` و`/home/for-you`.
- لا يوجد سجل تاريخي لصحة البوابة في D1؛ بقي Durable Object للحالة الآنية.
- بقيت مؤشرات الكاش عبر Workers Analytics Engine (`CACHE_METRICS`) بدل إضافة كتابة D1 لكل طلب أو جدول rollup يومي.
- لم يضف `rollout_percent` إلى Feature Flags.
- لم تُنشأ جداول/مهام مجمّعات المدن.
- لم تُضف مسارات افتراضية مثل `/trending` أو `/promoted` أو `/featured`؛ لا يكفي الاسم المقترح لإضافتها دون route فعلي وعقد API.

## ملفات المرحلة

- `workers/cf-api-proxy/worker.ts`
- `workers/cf-api-proxy/cache-policy.test.mjs`
- `workers/cf-api-proxy/wrangler.toml`
- `workers/cf-api-proxy/wrangler.example.jsonc`
- `workers/cf-api-proxy/SMART-GATEWAY-IMPLEMENTATION-AR.md`
- `apps/api/src/shared/cache/publicMutationTags.ts`
- `apps/api/tests/unit/publicMutationCacheTags.test.ts`

## نتائج الفحص

- `tsc -p workers/cf-api-proxy/tsconfig.json --pretty false`: **نجح**.
- `node workers/cf-api-proxy/cache-policy.test.mjs`: **نجح**، بما في ذلك فحوص TTL والـ whitelist والصفحات ومسارات الكاش الجديدة وCron.
- ترجمة `publicMutationTags.ts` باستخدام TypeScript strict: **نجحت**.
- فحوص Node مركزة لوسوم إبطال المنتجات والمجموعات والمبيعات والتقييمات: **نجحت**.
- مجموعة Vitest الكاملة للـ API: **لم تُشغّل** لأن `node_modules` غير موجودة في نسخة المشروع.
- لم يتم النشر إلى Cloudflare أو Render، ولم يُختبر التطهير الفعلي مع أسرار الإنتاج أو حساب D1 مباشر.

## قبل تفعيل TTL الطويل في الإنتاج

1. ضبط `CF_CACHE_TAG_PURGE_ENABLED=true` في API.
2. ضبط `EDGE_WORKER_PURGE_URL` و`EDGE_WORKER_PURGE_TOKEN` في API، وضبط `PURGE_TOKEN` في Worker بالقيمة نفسها تمامًا.
3. التأكد من أن صلاحيات/URL التطهير تعمل، وتنفيذ تعديل تجريبي ثم التحقق من اختفاء مفاتيح/استجابات الوسوم من الكاش.
4. بعد نجاح ذلك، اضبط `REFERENCE_CACHE_PURGE_READY=true` أولاً، وتحقق من TTL المحافظ؛ لا تفعّل `REFERENCE_CACHE_LONG_TTL_ENABLED=true` إلا كخطوة مستقلة أخيرة.

**ملاحظة:** الصف لا يُخدم بعد تجاوز `maxAgeSec`؛ يحتفظ D1 به حتى ذلك العمر فقط. أما `freshSec` فهو العمر قبل اعتباره stale ومحاولة إعادة التحديث.
