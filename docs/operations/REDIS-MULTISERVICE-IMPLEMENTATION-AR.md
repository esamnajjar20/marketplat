# Redis Multi-Service – تقرير التنفيذ

## ما أُضيف

أصبحت اتصالات Redis في Express موزعة على خدمات منطقية مستقلة، ولكل خدمة عنوان Redis TCP اختياري مستقل:

| المتغير | الاستخدام | سلوك التراجع |
|---|---|---|
| `REDIS_SESSION_URL` | Refresh tokens، session metadata، blacklist، وuser auth projection/invalidation | Redis الأساسي |
| `REDIS_RATE_LIMIT_URL` | Redis store لحدود المعدل، وخصوصًا المسارات الأمنية fail-closed | Redis الأساسي |
| `REDIS_PUBSUB_URL` | نشر/اشتراك أحداث SSE والإشعارات بين نسخ API | Redis الأساسي |
| `REDIS_QUEUE_URL` | BullMQ producer/worker sockets | Redis الأساسي |
| `REDIS_PRESENCE_URL` | online/last-seen heartbeats | Redis الأساسي |
| `REDIS_BUFFER_URL` | API activity/views buffers التي يقرأها Go Worker | Redis الأساسي |
| `REDIS_CACHE_URL` | الكاش القابل لإعادة البناء | إعدادات `REDIS_CACHE_HOST/PORT` القديمة، ثم Redis الأساسي |

تُقبل عناوين `redis://` و`rediss://` فقط. ويتحقق بدء التشغيل من أن Redis الخاص بالكاش لا يشارك نفس `host:port` مع Redis الأساسي أو الجلسات أو rate limits أو queue أو buffers؛ لأن سياسة eviction تُطبق على الخادم كله حتى لو اختلف رقم قاعدة البيانات. ما لم يُضبط عنوان مستقل، يعاد استخدام عميل Redis الأساسي الحالي؛ لذلك لا يحتاج النشر الأول إلى نقل بيانات أو تغيير متغيرات الإنتاج. كما أضيفت إعادة استخدام للعميل عندما تتشارك الخدمات عنوانًا وإعدادات اتصال متطابقة لتجنب مضاعفة الاتصالات بلا داعٍ.

## فصل الاستخدامات في الكود

- وحدات المصادقة و`tokenStore` و`refreshLock` تستخدم `sessionRedis`.
- `rateLimit.middleware.ts` يستخدم `rateLimitRedis` مع الحفاظ على دلالات fail-open/fail-closed الحالية. تعيين `REDIS_RATE_LIMIT_URL` يفعّل Redis store تلقائيًا حتى لا يُضبط endpoint مستقل بينما تبقى المحددات الرخيصة على MemoryStore.
- `notificationStream` يستخدم `pubSubRedis` للنشر والاشتراك، بينما يبقى replay buffer على `cacheRedis` لأنه قابل لإعادة البناء.
- BullMQ ينشئ اتصالات producer/worker مستقلة إلى `REDIS_QUEUE_URL` إن ضُبط، ويحافظ على `maxRetriesPerRequest` المختلف لكل دور. مفاتيح idempotency الخاصة بمعالجة jobs تستخدم `queueRedis` أيضًا.
- `presence.ts` يستخدم `presenceRedis`.
- كاش التصنيفات وأنواع المتاجر والخدمات ونتائج البحث وملخصات الإدارة وعدّاد الإشعارات غير المقروءة يستخدم `cacheRedis` أيضًا. كاش إسقاط المستخدم المستخدم في قرارات المصادقة يستخدم `sessionRedis` مع قنوات invalidation التابعة له، ولا ينتقل إلى مخزن cache قابل للإخلاء.
- الاستخدامات التشغيلية/القديمة والأقفال ومخازن الكتابة المؤقتة التي لم تُنقل تبقى على `redis` الأساسي عمدًا.
- Express يكتب activity/views buffers إلى `bufferRedis`، وGo Worker يقرأ المخازن نفسها. يجب أن يكون `REDIS_BUFFER_URL` في API هو نفسه `GO_WORKER_BUFFER_REDIS_URL` في Go (أو يقرأ Go `REDIS_BUFFER_URL` المشترك مباشرة). تبقى `GO_WORKER_REDIS_*` القديمة مدعومة عند عدم ضبط عناوين الخدمة. كما يقبل Go `REDIS_CACHE_URL` لمخزن الكاش عند عدم ضبط `GO_WORKER_CACHE_REDIS_URL`.

## الصحة والإغلاق

- فحص لوحة الإدارة يعرض حالة كل خدمة منطقية، وزمن PING، وهل تتصل بعنوان مستقل أو تشارك Redis الأساسي أو خدمة أخرى. لا يعرض العناوين أو أسماء المستخدمين أو كلمات المرور. إعداد العناوين والأسرار يتم من متغيرات بيئة خدمات Render/Go، وليس من المتصفح أو لوحة الإدارة.
- الفحص يدوي عند فتح مركز صحة النظام أو الضغط على تحديث؛ لم تتم إضافة Cron أو warmup أو مؤقتات health checks جديدة.
- بدء API و`/ready` يتحققان من Redis الأساسي وخدمات الجلسات وتحديد المعدل والـbuffers (إذا كانت مستقلة). أما cache وpresence وPub/Sub والطوابير فاختيارية ولا تمنع الإقلاع.
- Pub/Sub والطوابير والحضور لا تمنع بدء API عند تعطلها؛ لكل منها سلوك fallback موجود أو استجابة متدهورة مقصودة.
- إغلاق API والسكريبتات يمر عبر `closeRedisServiceClients()` لإغلاق العملاء المنطقية الفريدة، مع إغلاق اتصالات BullMQ من `stopNotificationQueue()`.

## سياسة النسخ والتوجيه

هذه الخدمات ليست موازنة round-robin على عدة Redis masters. كل خدمة stateful لها endpoint authoritative واحد. إن احتجت نسخًا أو failover، استخدم endpoint الذي يوفره مزود Redis مع HA/replication مدارة خلف عنوان واحد، بشرط توافقه مع Redis TCP/ioredis. لا توجه session أو rate-limit أو Pub/Sub أو BullMQ عشوائيًا إلى قواعد مستقلة؛ ذلك يسبب انقسام الحالة أو فقدان jobs أو حدود معدل غير متسقة.

Cloudflare Smart Gateway لا يفتح Redis TCP sockets، ولم يُضف إليه أي Redis password. هو يبقى بوابة HTTP لإدارة/توجيه Backend وFrontend وGo Worker فقط؛ الاتصالات الفعلية بخدمات Redis تنشأ من Express وGo Worker. عناوين REST-only لا تعمل مع إعدادات socket هذه وتحتاج adapter HTTPS منفصلًا.

## خطة تشغيل آمنة

1. انشر الكود أولًا مع إبقاء جميع `REDIS_*_URL` الجديدة فارغة؛ عندها تستخدم كل الخدمات Redis الحالي، ويكون التغيير متوافقًا دون نقل بيانات.
2. ابدأ بـ `REDIS_CACHE_URL` لأنه مخزن قابل لإعادة البناء. توقع cache cold start، واضبطه بسياسة `allkeys-lru` أو `allkeys-lfu`، لا `noeviction`.
3. لا تضبط `REDIS_BUFFER_URL` على Redis بإخلاء مفاتيح عشوائي؛ مخزن views يحتوي `views_buffer:inflight` بلا TTL، لذلك يحتاج `noeviction` وسياسة persistence/restart مناسبة لدى المزود.
4. `REDIS_PRESENCE_URL` يمكن نقله بعد ذلك؛ ستختفي مؤشرات الحضور القديمة مؤقتًا حتى تنتهي TTLs.
5. انقل `REDIS_BUFFER_URL` وGo Worker إلى العنوان نفسه فقط بعد إيقاف/تصريف activity/views buffers؛ لا تجعل API وGo يقرآن مخزنين مختلفين لأن ذلك يجزئ البيانات ولا يعود Go يرى مفاتيح API.
6. انقل Pub/Sub فقط بعد ضبط القيمة نفسها لكل نسخ API؛ يجب أن تشترك جميع النسخ في bus موحد.
7. لا تضبط `REDIS_QUEUE_URL` قبل إيقاف/تفريغ jobs أو تنفيذ cutover منسق لكل producers/workers. خلاف ذلك تبقى jobs القديمة في Redis السابق.
8. لا تضبط `REDIS_SESSION_URL` قبل ترحيل مفاتيح الجلسات والـ blacklist بطريقة مضبوطة، أو إعلان تسجيل خروج شامل. بدءًا من عنوان جديد فارغ سيؤدي إلى فقدان الجلسات المخزنة في Redis السابق.
9. نقل `REDIS_RATE_LIMIT_URL` يبدأ عدادات جديدة؛ نفّذه كتحول متزامن، مع إدراك أن نوافذ الحدود الحالية لن تُنقل.
10. إذا احتجت إعدادات مختلفة لكل خدمة Go، لا تضع `GO_WORKER_BUFFER_REDIS_URL` إلا إذا كان مطابقًا لـ`REDIS_BUFFER_URL` في API؛ وإلا استخدم متغير `REDIS_BUFFER_URL` المشترك على الطرفين.

## حدود التنفيذ الحالي

- لا يوجد نقل آلي للمفاتيح أو jobs أو buffers بين Redis providers؛ هذا مقصود لتجنب نسخ بيانات غير متسق أو تجاوز idempotency.
- لا يوجد round-robin أو sharding لعمليات الكتابة stateful، ولا إعداد Sentinel/Cluster متعدد العناوين في هذه الجولة. استخدم endpoint مدارة واحدة لكل خدمة. بعض أوامر Lua متعددة المفاتيح في النظام قد تحتاج تصميم hash-slot واعيًا قبل دعم Redis Cluster مباشرة.
- لا يوجد adapter لـ HTTP REST-only Redis providers.
- لم يتم تغيير أي secret إنتاجي أو إجراء اتصال بخدمات Render/Aiven الفعلية.

## التحقق

- `go test ./internal/rediswire` و`go vet ./internal/rediswire` نجحا محليًا.
- `go test ./...` لم يكتمل لأن اعتماد `github.com/jackc/pgx/v5` غير متوفر في Go module cache، والبيئة لا تسمح بجلبه مع `GOPROXY=off`.
- TypeScript transpile/syntax validation للـ40 ملف TypeScript/TSX المعدّل نجح.
- `tsc --noEmit -p apps/api/tsconfig.test.json` لم يكن قابلًا للتحقق الكامل لأن `apps/api/node_modules` غير موجودة؛ ظهرت أخطاء اعتماديات أساسية مفقودة مثل `express` و`ioredis` و`zod` و`@types/node`. لذلك لا أعتبر بناء API أو اختبارات Jest/واجهة الإدارة مثبتة في هذه البيئة.
- لم يتم النشر على Render أو التحقق من اتصالات Redis فعلية.
