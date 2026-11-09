# تقرير التدقيق العميق لخادم MarketPlat API

**التاريخ:** 9 نوفمبر 2026  
**النطاق:** `apps/api` مع مراجعة عقود التكامل ذات الصلة في `frontend` و`apps/mobile` و`packages/contracts`.  
**القرار العام:** توجد بنية Backend جيدة نسبيًا في الأمن والتعامل مع الاتساق، وقد عولجت أربع مشكلات مؤكدة في المصدر. لا أوصي باعتبار الخادم معتمدًا للإنتاج من هذا التدقيق وحده؛ فاختبارات Jest وPostgreSQL/Redis الفعلية وتعريض الحمل لم تُنفّذ بسبب عدم توفر التبعيات والاتصال بسجل npm في بيئة التدقيق.

---

## 1. الملخص التنفيذي

| البند | نتيجة المراجعة |
|---|---:|
| ملفات Routes | 45 |
| ملفات Controllers | 52 |
| ملفات Services | 58 |
| ملفات Repositories | 41 |
| تسجيلات `router.use` في الراوتر المركزي | 48 (تشمل middlewares ومسارات فرعية) |
| نماذج Prisma | 75 |
| Enums في Prisma | 45 |
| أسطر فهارس/قيود فريدة `@@index` و`@@unique` | 190 |
| ملفات TypeScript المعدلة التي اجتازت الترجمة النحوية | 8/8 |
| اختبارات تشغيل مباشرة لمنطق IPv6 | 6/6 |
| اختبارات Jest / DB / E2E المنفذة | لم تُنفّذ؛ التبعيات غير متاحة |

**الإصلاحات المؤكدة المنفذة:**

1. توصيل رفع الصور المفردة والمتعددة بآلية Redis semaphore العالمية حتى لا تتجاوز طلبات صور الإعلانات والمنتجات والخدمات سقف الرفع المشترك بين نسخ API.
2. إصلاح تطبيع IPv6 المستخدم في مفاتيح Rate Limiting، بما يشمل العناوين المضغوطة والموسعة وIPv4-mapped IPv6.
3. السماح عبر CORS بترويسة `Idempotency-Key` التي يدعمها Controller بالفعل، دون تغيير عقد API.
4. منع تسجيل خروج المستخدم تلقائيًا عند فشل Redis/قاعدة البيانات أثناء Refresh؛ تُمسح Cookies فقط عند رفض المصادقة `401`.

لم تتغير جداول Prisma أو migrations أو أجسام طلبات/استجابات API. التعديل الوحيد على CORS إضافي ولا يكسر العملاء الحاليين.

## 2. خريطة البنية وتدفق الطلب

```text
HTTP Request
  │
  ├─ Helmet / CORS / Compression (مع استثناء SSE)
  ├─ Cookie Parser / Passport initialize (stateless)
  ├─ Request ID + Database Query Context
  ├─ Offline Operation ID validation
  ├─ Metrics + Morgan
  ├─ Global API Rate Limit (/api)
  ├─ JSON / URL-encoded limits (50 KB)
  │
  └─ /api/v1
       ├─ public cache invalidation intent
       └─ Router
            ├─ privateApiCacheDefault (private/no-store افتراضيًا)
            ├─ CSRF double-submit عند وجود Cookie session
            └─ Module Router
                 ├─ Route-level auth / role / rate limit / validation
                 ├─ Controller
                 ├─ Service (business rules / transactions)
                 ├─ Repository أو Prisma access
                 └─ PostgreSQL / Redis / Cloudinary / providers
                      │
                      └─ Error Middleware → Error Response موحدة
```

**مصادر الخريطة:** `src/app.ts:1-265, 600-645`، `src/routes.ts:61-176`، `src/middlewares/auth.middleware.ts`، `src/middlewares/csrf.middleware.ts`، `src/middlewares/error.middleware.ts`.

### ترتيب Middleware المهم

- Helmet وCORS وCompression قبل معالجات API؛ Compression يتجنب مسار SSE حتى لا يحجز دفعات الأحداث.
- `requestIdMiddleware` و`databaseRequestContextMiddleware` و`offlineOperationIdMiddleware` قبل Controllers.
- `/health` و`/ready` و`/live` و`/metrics` قبل محدد API العام حتى لا تستهلك حصص المستخدمين.
- Morgan قبل Rate Limiting لتسجيل طلبات 429 أيضًا.
- `express.json` و`urlencoded` بحد 50KB؛ ملفات Multipart لها حدود Multer منفصلة.
- الراوتر المركزي يطبق `privateApiCacheDefault` و`csrfProtection` قبل Routers المجال.

### تغطية Routers

تم حصر 45 ملف Route ضمن المجالات التالية: auth، users، ads، home، sellers، stores، products، product-categories، marketplace-orders، promotions، collections، sales/installments/public-stats، customers، categories، search، recommendations، favorites، follows، stories، media، conversations، notifications، blocked-users، saved-searches، activity، reports، audit-logs، analytics، fraud، admin، user-simulator، appointments، service-providers، service-categories، service-types، service-listings، service-requests، requests، service-reviews، badges، observability.

وجود ملف Route أو Controller لا يثبت وحده صحة كل endpoint؛ إثبات العقود والسلوك يتطلب اختبارات HTTP تكاملية بكل الحالات والصلاحيات.

## 3. نتائج الأمن والموثوقية والإصلاحات

### [P1] تجاوز حدّ الرفع العالمي عبر مسارات الصور — تم الإصلاح

**المسار:** `src/middlewares/upload.middleware.ts:35-96, 195-248`  
**السبب الجذري:** helper باسم `runWithDistributedMediaSlot` كان يحجز Redis lease لرفع الصوت والمرفقات، لكن `uploadMiddleware` و`uploadMultipleMiddleware` لم يكونا يستدعيانه. هذان المساران يستخدمان `multer.memoryStorage()`، ويقبل مسار الصور المتعددة حتى 10 ملفات، بحد 5MB للملف مع سقف تقريبي لحجم الطلب يبلغ 55MB. لذلك كان بإمكان عدة نسخ API استقبال عمليات رفع صور متزامنة خارج السقف العالمي البالغ 3.

**الأثر:** تضخم الذاكرة تحت ضغط رفع الصور، مع احتمال إعادة تشغيل Worker أو رفض طلبات غير مرتبطة بسبب استهلاك ذاكرة العملية.

**الإصلاح:** تمرير رفع الصور المفردة والمتعددة عبر Redis semaphore قبل Multer، والإبقاء على lease حتى `finish` أو `close`، مع معالجة إغلاق الاتصال قبل اكتمال الحجز وتسجيل فشل تحرير lease. بقيت حدود Multer والتحقق من Magic Bytes الحالية دون تغيير.

**اختبار أضيف:** `tests/unit/upload.middleware.test.ts:47-95` يرسل ثلاث عمليات Multipart متزامنة، ويتوقع رفض الرابعة بـ503 و`MEDIA_UPLOAD_CAPACITY`، ثم يتأكد من تحرير الحجوزات بعد الاستجابة. كما عُدّل `tests/setup.ts` ليحاكي Lua acquire/extend/release الخاصة بالـ semaphore.

**حالة الاختبار:** أُضيف ولم يُنفّذ بسبب عدم وجود Jest وتبعيات المشروع في البيئة.

### [P1] تطبيع IPv6 غير صحيح في مفاتيح Rate Limiting — تم الإصلاح

**المسار:** `src/middlewares/rateLimit.middleware.ts:1-84`، الاختبارات `tests/unit/rateLimit.middleware.test.ts:115-144`.  
**السبب الجذري:** تقسيم عنوان IPv6 على `:` ثم حذف الأجزاء الفارغة لا يوسّع `::` إلى hextets الصفرية. عند وجود الاختصار قبل الجزء الرابع كان مفتاح الشبكة /64 يُحسب بشكل غير صحيح، فتنتج عناوين ضمن الشبكة نفسها مفاتيح مختلفة، ما يضعف حدّ المحاولات ضد تدوير عناوين الخصوصية.

**الإصلاح:** استخدام `node:net.isIP` للتحقق، وتوسيع `::`، وتحويل IPv4 dotted tail، وتوحيد IPv4-mapped IPv6 إلى IPv4، ثم اشتقاق مفتاح /64 من أول أربعة hextets. حُدّث اختبار قديم كان يساوي خطأً بين شبكتين مختلفتين في الـ /64. كذلك أزيل cast إلى `any` عن استدعاء Redis `call` وأضيفت أنواع Express صريحة.

**اختبارات تشغيل منفذة:** 6/6 حالات مباشرة على دالة التطبيع المستخرجة من المصدر بعد ترجمتها بـ TypeScript: IPv4، compressed/expanded IPv6، فصل شبكتين /64 مختلفتين، mapped IPv4 المضغوط والموسع، وإزالة zone identifier. كما اجتازت ملفات الاختبار ترجمة الصياغة. اختبار Jest الأصلي أُضيف/حُدّث لكنه لم يُشغّل.

### [P2] CORS يمنع ترويسة Idempotency المدعومة — تم الإصلاح

**المسار:** `src/app.ts:94-109`، العقد في `src/modules/marketplace-orders/marketplace-orders.controller.ts:7-14`.  
**السبب الجذري:** Controller الطلبات يدعم `Idempotency-Key` كترويسة بديلة عندما لا تكون `idempotencyKey` موجودة في JSON body، لكن CORS `allowedHeaders` لم يكن يضمها؛ بالتالي قد يفشل Preflight قبل وصول طلب المتصفح إلى Controller.

**الإصلاح:** إضافة `Idempotency-Key` إلى `allowedHeaders` فقط. تم فحص المستهلكين داخل المشروع: Mobile يمرر `idempotencyKey` في جسم الطلب ويستخدم `X-Offline-Op-Id` للمزامنة، لذلك لا يحتاج إلى تغيير. لا يوجد تغيير في JSON contracts أو سلوك idempotency.

**حالة الاختبار:** لم يُنفّذ اختبار HTTP Preflight متكامل بسبب غياب التبعيات.

### [P1] Refresh يحوّل عطل البنية التحتية إلى تسجيل خروج — تم الإصلاح

**المسار:** `src/modules/auth/auth.controller.ts:125-151`، ومنطق رفض Refresh في `src/modules/auth/auth.service.ts:634-694`؛ الاختبارات `tests/unit/auth.controller.test.ts:141-202`.  
**السبب الجذري:** `catch` كان يمسح Cookies الخاصة بـ refresh/CSRF/session hint عند أي استثناء، بما في ذلك Redis أو PostgreSQL outage. فشل خدمة مؤقت يتحول بذلك إلى Logout دائم للمتصفح حتى لو لم يكن Refresh Token غير صالح.

**الإصلاح:** لا تُمسح Cookies إلا عندما يكون الخطأ `AppError` وحالته `401`. أخطاء `503` والأخطاء غير المتوقعة تمر إلى Error Middleware مع الحفاظ على Cookies ليتمكن العميل من إعادة المحاولة. `authService.refresh` يوحد أخطاء انتهاء/إبطال/رفض التوكن في `UnauthorizedError` بحالة 401.

**اختبارات أضيفت:** حالات رفض Token تمسح Cookies الثلاث، بينما `ServiceUnavailableError` وخطأ قاعدة بيانات عام يحافظان عليها. لم تُنفّذ بسبب غياب Jest.

## 4. مراجعة مكونات المنظومة

### Authentication وAuthorization وCSRF

- Middleware المصادقة يتحقق من JWT ثم من الإبطال/blacklist ويستخدم ذاكرة L1 وRedis وUser Cache؛ كما يعيد التحقق من حالة الحساب النشط.
- مسارات الإدارة تستخدم Middlewares الأدوار والحدود المخصصة؛ يجب الاحتفاظ باختبارات مصفوفة الأدوار لكل Endpoint في CI.
- CSRF يفرض double-submit عندما توجد Cookie جلسة، ويترك عملاء Bearer الذين لا يحملون Cookie خارج فحص CSRF. هذا متسق مع تكاملات API الحالية، لكنه يعتمد على عدم خلط نمطي Bearer وCookie في العميل نفسه.
- يجب مراجعة سياسات CORS و`TRUST_PROXY` مع بيئة النشر الفعلية؛ قيمة Trust Proxy تؤثر مباشرة في `req.ip` ومفاتيح Rate Limit.

### Validation وError Handling وPayload Limits

- Zod يُستخدم في Controllers للتحقق من body/query/params في المجالات التي راجعتها.
- Error Middleware يتعامل مع ZodError وAppError وأخطاء Body Parser وبعض أخطاء Prisma المعروفة، ويخفي تفاصيل 5xx عن العميل.
- JSON وURL-encoded محدودان بـ50KB، وMulter يضع حدود الملفات والحقول والأجزاء.
- يجب التأكد أثناء اختبار عقد API أن جميع Controllers المستقبلية تمر عبر schemas؛ وجود Zod في بعض المسارات لا يغني عن تدقيق كل route handler.

### PostgreSQL وPrisma وConnection Pool

- يوجد Prisma singleton مع قياس مدة الاستعلامات (`src/config/prisma.ts`).
- يوجد فحص سعة عند بدء التشغيل (`src/shared/utils/capacityCheck.ts:80-116`) يقدّر `PM2 instances × connection_limit` ويحذر قرب الحد. مثال `.env.example` يستخدم `connection_limit=20` و`pool_timeout=30`؛ Docker Compose يضبط PostgreSQL على `max_connections=200`.
- **قيد تشغيلي:** فحص السعة heuristic وليس enforcement؛ يعتمد افتراضيًا حد 200 وعدد CPU أو `PM2_INSTANCES`، وقد لا يطابق حد Aiven/Render الفعلي أو عدد نسخ الإنتاج. يلزم مطابقة هذه القيم مع Database plan وعمليات Worker والمهاجرات والنسخ الاحتياطي.
- مخطط Prisma يضم 75 model و45 enum و190 سطر فهارس/قيود `@@index`/`@@unique`؛ لا يمكن استنتاج جودة كل خطة استعلام دون `EXPLAIN ANALYZE` على بيانات ممثلة.

### Redis وCache وTimeouts

- `src/config/redis.ts:6-77` يعرف عملاء منطقيين للـ sessions وrate-limit وpub/sub وqueue وpresence وbuffers، ويعيد استخدام اتصال واحد عندما تتطابق الـ URLs.
- مهلات الاتصال وإعادة المحاولة محددة؛ BullMQ يستخدم إعدادات اتصال منفصلة مناسبة لدور worker.
- Cache guard (`src/shared/utils/cacheGuard.ts`) يضع مهلة 1.5 ثانية وقاطع دائرة للمسارات ذات الـ cache القابل لإعادة البناء، حتى لا تنتظر قراءات الكاش تعطل Redis طويلًا قبل الرجوع إلى قاعدة البيانات.
- Health readiness يفحص DB والخدمات الحرجة من Redis بمهلة، ويجمع الطلبات المتزامنة عبر Promise dedup (`src/shared/utils/healthCache.ts`).
- لا يمكن التحقق من صحة failover بين خدمات Redis أو اختلاف الـ latency أو أثر provider limits دون Redis حقيقي وحمل متزامن.

### Transactions وMarketplace Orders وStock

- `src/modules/marketplace-orders/marketplace-orders.service.ts` يستخدم Serializable transactions لإنشاء الطلبات وإلغاءها، ويقفل سجل الطلب قبل انتقال الحالة، ويرتب أقفال المنتجات، ويستخدم تحديث مخزون مشروطًا، ويحرس عداد استخدام العروض، ويحفظ Snapshot السعر ومعلومات المنتج داخل عناصر الطلب.
- مخطط التحقق يسمح حتى 50 عنصرًا ويمنع تكرار productId داخل الطلب (`marketplace-orders.validation.ts:5-17`).
- **تحسين مؤجل P2:** أقفال المنتجات وبعض قراءات المخزون في الإنشاء والإلغاء تُنفذ داخل loops متتابعة لكل منتج. مع الحد الأعلى 50 عنصرًا، قد يؤدي ذلك إلى عدد كبير من round trips داخل Serializable transaction. لم أغيّرها قبل اختبار PostgreSQL فعلي لأن ترتيب الأقفال وتزامن الإلغاء مع الشراء حساس، ويجب قياسه باختبار تنافسية DB قبل استبداله باستعلامات مجمعة.
- لم يُنفّذ اختبار منافسة فعلي لطلبين على آخر قطعة أو طلبين لإلغاء الطلب نفسه؛ لا أعدّ static audit script دليلًا على صحة concurrency.

### Background Jobs وTransactional Outbox

- `OutboxEvent` و`OutboxEventIdempotency` معرفان في Prisma schema؛ الـ worker يستخدم leases وheartbeat و`FOR UPDATE SKIP LOCKED` وbackoff وdead-letter، كما توجد دورة منفصلة لإرسال Push Dispatches/Targets.
- هذه مؤشرات تصميم جيدة لمنع الفقد والتكرار بعد commit، لكن يجب إثباتها بتجارب توقف worker بعد claim وقبل acknowledgement، وانقطاع Redis، وفشل مزود Push، وإعادة تشغيل أكثر من Worker. لم تُنفّذ هذه التجارب في البيئة الحالية.

## 5. مخاطر متبقية وتحسينات مؤجلة

| الأولوية | الموضوع | التقييم والإجراء المطلوب |
|---|---|---|
| P1/P2 | فحص محتوى الصوت والمرفقات | صور JPEG/PNG/WebP تخضع لفحص Magic Bytes، لكن الصوت والمستندات يعتمدون أساسًا على MIME المعلن من العميل. يلزم فحص تواقيع حقيقية و/أو AV scanning أو quarantine قبل إتاحة الملفات، وفق سياسة المنتج ومزود التخزين. لم أضف مكتبة فحص غير مثبتة أو أغيّر أنواع الملفات المقبولة. |
| P2 | loops داخل معاملات Marketplace Orders | قياس عدد الاستعلامات وزمن transaction مع 1 و10 و50 منتجًا، ثم دراسة تجميع locks/reads. مؤجل لتجنب تغيير سلوك التزامن بلا DB tests. |
| P2 | DB pool sizing | مطابقة `connection_limit` و`PM2_INSTANCES` وحد PostgreSQL الفعلي مع جميع نسخ API وWorkers والعمليات الإدارية. فحص الكود الحالي تحذيري فقط. |
| P2 | Redis failure modes | اختبار كل خدمة Redis مستقلة، وفقدان الاتصال أثناء رفع ملف/Refresh/Rate Limit/Outbox، والتحقق من behavior fail-open/fail-closed في بيئة Redis فعلية. |
| P2 | التغطية التعاقدية | تشغيل اختبارات Contract عبر جميع Frontend/Mobile المستهلكين لكل endpoint، خصوصًا حالات الأخطاء والـ pagination والـ role permissions؛ لم أغيّر response shapes. |
| P2 | Load/Soak وMemory | قياس RSS وHeap وevent-loop delay مع Multipart uploads متزامنة وSSE وعمليات Outbox على عدة workers. |
| P3 | توحيد طبقات Repository | يوجد تباين بين بعض المجالات؛ بعض Services/Controllers تتعامل مع Prisma مباشرة أو تستخدم repository بحسب عمر الوحدة. لم أنفذ إعادة هيكلة واسعة لأنها لا تعالج عيبًا وظيفيًا مثبتًا وقد توسع نطاق التغيير. |

## 6. الملفات التي تغيّرت

| الملف | التغيير |
|---|---|
| `apps/api/src/middlewares/upload.middleware.ts` | توصيل upload الصور بالـ Redis semaphore العالمي، وربط lease بعمر الاستجابة. |
| `apps/api/src/middlewares/rateLimit.middleware.ts` | تطبيع IPv6/IPv4-mapped بصورة صحيحة، إزالة `any` من Redis call، وتوضيح أنواع Express. |
| `apps/api/src/app.ts` | إضافة `Idempotency-Key` إلى CORS allowed headers. |
| `apps/api/src/modules/auth/auth.controller.ts` | عدم مسح Cookies عند أخطاء البنية التحتية؛ مسحها فقط عند 401. |
| `apps/api/tests/setup.ts` | محاكاة Lua semaphore acquire/extend/release داخل Redis mock. |
| `apps/api/tests/unit/upload.middleware.test.ts` | اختبار سعة الرفع المتزامن بمسارات Multipart حقيقية عبر Supertest. |
| `apps/api/tests/unit/rateLimit.middleware.test.ts` | تصحيح/توسيع تغطية IPv6 /64 وIPv4-mapped. |
| `apps/api/tests/unit/auth.controller.test.ts` | حالات Refresh 401 مقابل 503 وأخطاء البنية التحتية. |

**لا توجد migrations أو تغييرات على Prisma schema أو frontend/mobile.**

## 7. الاختبارات والتحقق المنفذ

### ما نُفذ فعليًا في بيئة التدقيق

| الفحص | النتيجة | ماذا يثبت؟ |
|---|---:|---|
| TypeScript `transpileModule` للملفات الثمانية المعدلة | 8/8، صفر Syntax Diagnostics | سلامة الصياغة/الترجمة النحوية فقط، وليس type-check دلاليًا. |
| تنفيذ دالة تطبيع IPv6 الفعلية من المصدر بعد ترجمتها | 6/6 | تطابق مفاتيح /64، فصل الشبكات، IPv4-mapped، zone identifier. |
| مراجعة المستهلكين الحاليين لترويسة Idempotency | اكتملت على مصادر Frontend/Mobile | تحديد أن Mobile يستخدم body و`X-Offline-Op-Id` وعدم وجود حاجة لتغيير payload. |

### ما لم يُنفذ ولماذا

- `npm ci --offline --ignore-scripts`: فشل بـ`ENOTCACHED` لأن حزمًا مثل `zod` ليست في npm cache.
- محاولة `corepack pnpm --version`: فشلت بسبب `EAI_AGAIN registry.npmjs.org` أثناء تنزيل pnpm 10.18.0.
- لا يوجد `node_modules` ضمن الأرشيف.
- لذلك لم تُشغّل Jest unit/integration، أو `tsc --noEmit`، أو ESLint، أو Prisma generate، أو build، أو Playwright/Supertest suites، أو اختبارات PostgreSQL/Redis الحقيقية، أو concurrency/load tests.
- لا توجد نتيجة ناجحة لقاعدة البيانات أو Redis أو Cloudinary في بيئة الإنتاج يمكن الاستناد إليها هنا.

## 8. تقييم الجاهزية للإنتاج

**الحالة: جاهزية مشروطة — لا يوجد اعتماد إنتاجي نهائي من هذا التدقيق.**

الإصلاحات الأربعة موضعية وتحافظ على عقود العملاء، والبنية تتضمن عناصر قوية مثل CSRF، private-cache default، request IDs، حدود body، error normalization، Redis logical clients، health checks، transactional outbox، وSerializable transactions للطلب والمخزون.

قبل اعتماد النشر، يجب تشغيل CI فعليًا على Node 22 وpnpm 10.18.0، وإثبات نجاح `type-check` وESLint وJest، ثم DB-backed tests للطلب/المخزون والإلغاء المتزامن وRate Limiting/Redis semaphore على Redis مشترك، واختبار Preflight لـ`Idempotency-Key`، وتجربة رفع متزامن فعلية، ومراجعة فحص ملفات الصوت/المرفقات، ومطابقة DB pool على خطة الاستضافة الفعلية.

لا تُفسّر نتائج الترجمة النحوية أو اختبارات الدالة المعزولة على أنها نجاح لاختبارات API أو صحة تشغيلية للنظام كاملًا.
