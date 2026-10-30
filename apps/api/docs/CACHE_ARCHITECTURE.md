# معمارية الكاش والتسخين (Backend)

## الطبقات
1. **المتصفح/SW**: ترويسات `Cache-Control` من `cacheControl.middleware.ts` (`LIVE` = 30+30، `SHORT` = 90+60، `LONG` = 3600+600). الفرونت لا يقرأ قيم `stale-while-revalidate` أصلاً؛ الـ Service Worker له استراتيجياته الخاصة، فتغيير الترويسات لا يؤثر على منطق التسخين هناك.
2. **Redis SWR** (`shared/utils/swrCache.ts`): محرك واحد لكل الكاشات العامة: الرئيسية، قوائم الإعلانات، قوائم stores/products/service-listings/service-providers.
3. **التسخين** (`shared/utils/cacheWarmup.ts`): عند الإقلاع ثم كل 4 دقائق.
4. **الإبطال**: أجيال (generation tokens) وليس حذف مفاتيح.

## الإبطال بالأجيال
كل مفتاح كاش مختوم بـ token الجيل الذي كان ساري عند **بدء** بنائه. الإبطال = استبدال الـ token بقيمة عشوائية جديدة. أي قيمة مختومة بجيل قديم تُتجاهل عند القراءة مهما كان وقت كتابتها، فلا يمكن لتحديث خلفي بدأ قبل الحذف أن يُرجع المحتوى المحذوف.

| القوة | متى | الأثر |
|---|---|---|
| **Hard** | حذف، بيع/غير ACTIVE، حظر، إيقاف بائع، حذف حساب، تغيير حالة إدارية | لا يُخدَم أي شيء قديم؛ إعادة بناء متزامنة |
| **Soft** | إنشاء، تعديل، صور، featured/pinned | يُخدَم القديم فوراً مرة واحدة، وعملية واحدة تحدّث بالخلفية |

مفاتيح الأجيال: `home:gen`، `ads:gen:hard`، `ads:gen:soft`، `plist:gen:{hard|soft}:<ns>`.
كل قراءة كاش = `MGET` واحد للقيمة + الأجيال (رحلة Redis واحدة).

## الرئيسية
`home:v4:<city|general>`، soft 30–40ث، hard 10 دقائق. بعد أي إبطال hard يُعاد تسخين المفتاح العام تلقائياً بعد 1.5ث (مع دمج التتابعات)، ثم المدن العشر تتابعيًا (150ms بينها) — مرة كل 30ث كحد أقصى حتى لا تتحول سلسلة عمليات حذف إلى سلسلة إعادة بناء (HOME-REWARM-CITIES-01). إبطال أحدث يوقف حلقة المدن الأقدم.

## التسخين المستمر
كل 4 دقائق (أقل بكثير من hard TTL): يفحص الرئيسية العامة + 10 مدن + 3 تصنيفات، ويعيد بناء ما هو ناقص/مُبطَل فقط، أو ما عمره (`writtenAt`) تجاوز `HOME_KEEPWARM_MAX_AGE_MS` (300ث). لا يلاحق الـ soft TTL (30–40ث): الزيارات الحقيقية تحدّثه بالخلفية، فالمفتاح الذي جُدّد للتو يُتخطّى ولا يُعاد تجميعه (CACHE-KEEPWARM-AGE-01). شرط الأمان: `MAX_AGE + interval < hard TTL` (300+240 < 600) وإلا قد ينتهي مفتاح بين دورتين. الإدخالات القديمة بلا `writtenAt` وأي إبطال soft (تعديل) تُعاد بناؤها دائمًا. عملية واحدة تقود الدورة عبر قفل `cache:keepwarm:leader` (PM2 cluster أو عدة replicas). إذا Redis غير متاح تُتخطى الدورة.

## قوائم التسخين الافتراضية والـ hard TTL (WARM-LIST-HARD-TTL-01)
قوائم `publicLive` (ads/products/stores/service-listings/service-providers) hard TTL لها 90ث، بينما دورة التسخين 240ث؛ كانت المفاتيح المسخَّنة تنتهي قبل الدورة التالية بنحو 150ث (باردة ~60% من الوقت). الآن الأشكال المسخَّنة بالضبط (المعرّفة في `shared/cache/warmedListQueries.ts`) تأخذ hard TTL = 600ث، وأي استعلام آخر (فلاتر/بحث/صفحات أعمق) يبقى على 90ث. الإبطال لا يتأثر لأنه بالأجيال لا بالـ TTL. عند تغيير شكل استعلام مُسخَّن في الفرونت (`lib/warmingQueryContract.ts`) حدّث `warmedListQueries.ts` معه، وإلا يصبح المفتاح المسخَّن مفتاحًا مختلفًا (بارد).

## القياس
`cacheMetrics` يعرض في Prometheus:
- `app_cache_events_total{cache,event}`: `hit / stale / miss / bypass / refresh_ok / refresh_fail / lock_skip`، إضافة إلى `generation_bump_ok / generation_bump_fail`.
- `app_cache_operation_duration_seconds{cache,event}`: زمن قراءة SWR أو إبطال الجيل حسب النتيجة.

أسماء `cache` محصورة في قائمة ثابتة (`ads:list`, `home`, `home:feed`, `list:*`, `recommendations`, `users:profile`, `generation`). أي اسم غير معروف يتحول إلى `unknown` بدل إنشاء label غير محدود. لا تستخدم userId أو cache key أو URL أو query كـ label. تبقى لقطة `[cache-metrics]` في سجل التسخين، ويمكن بناء لوحات Grafana من Prometheus مباشرة. استعلامات PromQL المقترحة موجودة في `docs/CACHE_PROMETHEUS_QUERIES.md`.

مؤشرات الصحة: نسبة `hit+stale` من `hit+stale+miss+bypass`، و`bypass` (تعطل/بطء Redis)، و`refresh_fail`، وفشل `generation_bump_fail`، وزمن p95. لا تعتبر نسبة hit جيدة إذا ارتفع فشل الإبطال؛ correctness أهم من hit ratio.

## عند إضافة mutation جديد
بعد كتابة الـ DB: إن كان يجب **إخفاء** كيان → `bumpAdsCacheVersionAndHome()` (إعلانات) أو `hidePublicEntities(ns)` (غيرها). تعديل عادي → `bumpAdsCacheVersion()` أو `bumpPublicListCache(ns)`.

## Redis منفصل للكاش (CACHE-REDIS-SPLIT-01)
الـ Redis الأساسي يعمل بـ `noeviction` عمدًا (الجلسات وعدّادات rate-limit). ثمن ذلك: عند الامتلاء تفشل **كل** الكتابات، ومنها استبدال توكن الجيل الذي يجعل الإبطال (حذف/حظر) فعّالًا. لذلك كل مفاتيح `swrCache` (البيانات، توكنات الأجيال، أقفال التحديث، قائد التسخين) تمر عبر `cacheRedis`:
- `REDIS_CACHE_HOST` غير مضبوط → نفس العميل الأساسي (لا تغيير سلوك).
- مضبوط → نسخة منفصلة بـ `allkeys-lru` بلا persistence (`redis-cache` في `docker-compose.yml`). الإخلاء آمن هنا: التوكنات عشوائية، فضياع مفتاح جيل يعني فقط أن الإدخالات الأقدم تصبح غير مقروءة.
- المنفذ/كلمة السر/المستخدم/TLS تُورَّث من `REDIS_*` ما لم تُضبط `REDIS_CACHE_*`.
- `redisMemoryMonitor` ما زال يراقب الأساسي فقط.


## ضغط الذاكرة وأولوية الاحتفاظ (CACHE-MEMORY-PRIORITY-01)

- تتم مراقبة الذاكرة على Redis الأساسي وعلى `cacheRedis` المنفصل، مع مقاييس `redis_memory_*` و`redis_cache_memory_*` وتحذير عند 80%.
- عند بلوغ ذاكرة كاش SWR نسبة 85% من `maxmemory`، تتوقف دورة التسخين عن إعادة إنشاء المهام ذات الأولوية الأقل من 85 (متغيرات المدن وشرائط الصفحة الرئيسية). تبقى الصفحة العامة، الأشجار المرجعية، والقوائم الافتراضية الأعلى أولوية ضمن دورة التسخين.
- هذا يمنع warmup من إعادة ملء الذاكرة ببيانات قليلة الأهمية فور إخلائها. أما الإخلاء الفعلي على Redis المخصص للكاش فيجب أن يكون `allkeys-lru` أو `allkeys-lfu`؛ عند بلوغ `maxmemory` يختار Redis الإدخالات الأقل استخدامًا/الأقل تكرارًا تلقائيًا.
- لا تُحذف مفاتيح الجيل أو الأقفال يدويًا حسب الاسم؛ إزالتها عشوائيًا قد تضعف دلالات الإبطال أو التزامن. لا يتم إجراء أي حذف يدوي من Redis الأساسي الذي يحتوي الجلسات ومحددات المعدل.
- عند عدم ضبط `REDIS_CACHE_HOST`، يستخدم الكاش Redis الأساسي كما هو. في هذا الوضع لا يمكن إعطاء أولوية إخلاء منفصلة بأمان؛ أوصي بتكوين خدمة Valkey/Redis منفصلة بسياسة إخلاء `allkeys-lru` للكاش القابل لإعادة البناء، مع إبقاء الأساسي `noeviction`.


## الكاش الشخصي (تحديث 2026-10)

- كل استجابات `/api/v1` تبدأ افتراضيًا بـ `Cache-Control: private, no-store` و`Vary: Authorization, Cookie`. المسار العام لا يصبح قابلًا لكاش CDN إلا إذا اختار Middleware عامًا صراحةً (`CACHE.SHORT/MEDIUM/STATIC/PUBLIC_HOME`).
- الاستثناء المحدود هو `GET /users/me`: `private, no-cache` مع ETag ضعيف من Express. المتصفح يعيد التحقق في كل استخدام؛ إن لم تتغير الاستجابة يرجع `304` بلا Body. ويُظهر `X-Cache` حالة Redis (`HIT/STALE/MISS/BYPASS`) للتشخيص. وجود ETag لا يعني تجاوز التحقق من المصادقة.
- ملف المستخدم محفوظ في Redis بمفتاح Canonical خاص يتضمن `userId`، بمدة freshness ناعمة 20 ثانية ± 3 ثوانٍ وحد أقصى 60 ثانية. TanStack Query يحتفظ به لدقيقتين، والنسخة المحلية Offline مرتبطة بهوية صاحبها وتعد حديثة 15 دقيقة ولا تستخدم بعد 24 ساعة. كل `userCache.invalidate(userId)` يبطل كاش الملف عبر Generation مستقل؛ الكتابة القديمة التي تتداخل مع الإبطال لا تستطيع إعادة إدخال نسخة قديمة.
- لا نكاش استجابات الطلبات/السلة/الرسائل/الإشعارات/المبيعات وCRM والمواعيد أو بيانات الأعضاء الحساسة في Redis Response Cache. وينطبق ذلك حالياً على المفضلة والمتابعات والمجموعات الشخصية أيضاً: لديها Query Cache محلي ضمن جلسة المستخدم، لكن لا نضيف لها Redis Response Cache قبل حصر جميع عمليات الكتابة (toggle/state/list membership/reorder/follow) وربطها بإبطال ذري. تبقى `private, no-store` حتى تتوفر خطة إبطال واضحة لكل كتابة.
- كاش Cloudflare للبيانات المحمية غير مفعّل ولا نستخدم KV لكل مستخدم. الطلبات الحاملة لـ Authorization/Cookie تبقى خارج الكاش المشترك.
