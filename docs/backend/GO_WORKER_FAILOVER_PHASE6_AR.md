# MarketPlat — Go Worker Failover Phase 6

## الهدف

نقل أحمال التقارير والمهام المجدولة وأجزاء محددة من معالجة Outbox إلى Go، مع الإبقاء على Express بوابة المصادقة والصلاحيات، وعلى Express كمنفذ احتياطي عند تعذّر Go.

## ما نُقل في هذه المرحلة

### مخازن الكتابة عالية التكرار (Redis → PostgreSQL)

| المهمة | التكرار الحالي | مسار Go | Fallback |
|---|---:|---|---|
| Activity Buffer | كل 5 ثوانٍ | `POST /internal/jobs/activity-buffer-flush` | `activityBuffer.flush()` تحت Advisory Lock |
| Views Buffer | كل 60 ثانية | `POST /internal/jobs/views-buffer-flush` | `viewsBuffer.flush()` تحت Advisory Lock |

يبقى Express مسؤولاً عن استقبال أحداث النشاط وزيادة عدادات المشاهدات في Redis؛ الذي انتقل إلى Go هو التفريغ الدفعي إلى PostgreSQL. هذا يزيل آلاف عمليات الإدخال/التحديث الصغيرة من مسار عملية Express ويجمعها في إدخال/تحديث SQL دفعي. في حالة فشل SQL يعيد Go عناصر النشاط إلى بداية Redis List، ويعيد عدادات المشاهدات بواسطة Lua `INCRBY + EXPIRE`.

### التقارير والمهام المجدولة

| المهمة | مسار Go | Fallback |
|---|---|---|
| تقرير مشاهدات الإعلانات الأسبوعي | `POST /internal/jobs/weekly-ad-views` | SQL داخل Express ومعاملة + Advisory Lock |
| تقرير مشاهدات المتجر الأسبوعي | `POST /internal/jobs/weekly-store-views` | SQL داخل Express ومعاملة + Advisory Lock |
| تقرير مشاهدات الخدمات الأسبوعي | `POST /internal/jobs/weekly-service-views` | SQL داخل Express ومعاملة + Advisory Lock |
| مقاييس استجابة البائع | `POST /internal/jobs/seller-response-metrics` | CTE/UPDATE داخل Express |
| تذكير البائع اليومي | `POST /internal/jobs/sales-daily-reminder` | SQL داخل Express ومعاملة |
| تذكير الديون المتأخرة | `POST /internal/jobs/sales-debt-reminder` | SQL داخل Express ومعاملة |
| الأقساط المتأخرة | `POST /internal/jobs/sales-overdue-installments` | SQL داخل Express ومعاملة |
| تقرير المبيعات الأسبوعي | `POST /internal/jobs/weekly-sales-report` | SQL داخل Express ومعاملة |

تقارير المشاهدات تنشئ سجل Notification وسجل Push Dispatch وتحدّث baseline في المعاملة نفسها. يتم تحديث baseline إلى لقطة views التي جرى احتسابها، وليس إلى قيمة أحدث قد تكون وصلت أثناء تنفيذ التقرير؛ وهذا يمنع إسقاط الزيادات الجديدة.

مهام المبيعات تستخدم مفاتيح idempotency ثابتة لكل مستخدم/فترة، وتكتب Notification وPush Dispatch معاً في معاملة واحدة.

### معالجة Outbox

المسار `POST /internal/outbox/execute-event` ينفّذ داخل Go الأنواع التالية بعد أن يستلم Express الحدث ويحافظ على lease/heartbeat:

- `USER_ACTIVITY_RECORD`
- `SAVED_SEARCH_MATCH_NOTIFICATION`
- `FOLLOWED_ACTIVITY_NOTIFICATION`
- `CACHE_GENERATION_BUMP`

Go يقرأ الحدث من PostgreSQL ويتحقق من أن `lockedBy` ما زال يطابق worker الحالي، ثم يحفظ النشاط أو ينشئ إشعارات المستلمين وسجلات Push Dispatch ويؤكد الحدث في معاملة واحدة. قبل ذلك يحصل Go وExpress fallback على قفل transaction-scoped موحد حسب `eventId`، لمنع تداخل التنفيذ عند timeout أو فقدان استجابة HTTP. في أحداث الإشعارات يبقى Express مسؤولاً عن unread-cache invalidation وبث SSE. أما `CACHE_GENERATION_BUMP` فيتم في Go عبر نفس Redis المخصص للكاش عند ضبط `REDIS_CACHE_HOST`، أو Redis الأساسي عند عدم وجود مخزن منفصل.

إذا تعذر Go أو انتهت مهلة الاتصال، يفحص Express حالة الحدث أولاً، ثم يستعمل معالج Express الحالي إذا كان الحدث ما زال مملوكاً له. وإذا كان Go قد أكد الحدث قبل انقطاع الاستجابة، يسترجع Express الإشعارات الناتجة ولا يعيد إنشاءها.

## ما بقي في Express عمداً

1. **إرسال Web Push وFCM والبريد**: تبقى طبقة التسليم في Express لأنها تعتمد حالياً على `web-push` ومفاتيح VAPID و`firebase-admin` وتهيئة البريد، وتملك retry/lease/per-device delivery ledger. Go يكتب نية الإرسال الدائمة في `notification_push_dispatches` فقط.
2. **BullMQ notification consumer**: لم يتم استبدال بروتوكول BullMQ الداخلي بمستهلك Go مخصص؛ إعادة تنفيذ Redis/BullMQ دون توافق كامل قد تسبب فقد jobs أو مضاعفة retries.
3. **Search / Search Facets / Home Feed**: تبقى في Express حالياً؛ هي مسارات تفاعلية يغلب عليها عمل PostgreSQL. نقل كودها إلى Go مع إبقاء PostgreSQL نفسها لا يزيل كلفة الاستعلامات، وقد يضيف HTTP hop. نقلها الأفضل لاحقاً يكون بعد قياس الحمل وبناء snapshots/cache محسوبة مسبقاً.
4. **الطلبات والدفع والمصادقة**: تبقى في Express كمسارات أعمال حساسة.

## إعدادات النشر

في Express وGitHub Actions:

- `GO_WORKER_URL`
- `GO_WORKER_TOKEN`

في Render Go Worker:

- `GO_WORKER_TOKEN` بنفس القيمة
- `GO_WORKER_DATABASE_URL` أو `DIRECT_URL` لاتصال PostgreSQL مباشر ثابت الجلسة؛ لا تستخدم transaction-pooling لاتصال يعتمد على session advisory locks.
- `GO_WORKER_REDIS_URL` (مفضل) أو `REDIS_URL` بصيغة `redis://` أو `rediss://` لمخازن Activity/Views. ويمكن بدلاً منه ضبط `REDIS_HOST`, `REDIS_PORT`, `REDIS_USERNAME`, `REDIS_PASSWORD`, `REDIS_TLS`، أو متغيرات `GO_WORKER_REDIS_*` المقابلة.
- `GO_WORKER_CACHE_REDIS_URL` (اختياري) لمخزن الكاش المنفصل؛ أو استخدم `REDIS_CACHE_HOST`, `REDIS_CACHE_PORT`, `REDIS_CACHE_USERNAME`, `REDIS_CACHE_PASSWORD`, `REDIS_CACHE_TLS`. عند غياب `REDIS_CACHE_HOST` يستخدم Go إعداد Redis الأساسي نفسه كما يفعل Express.
- `DB_MAX_OPEN_CONNS=1` كبداية مع Aiven starter، وارفعها فقط بعد مراجعة حد الاتصالات الفعلي ومراقبة الاستخدام.

تم تفعيل trigger كل ساعة في `.github/workflows/sales-notifications.yml`، وتم تمرير `GO_WORKER_URL` و`GO_WORKER_TOKEN` إليه. يقوم `runSalesNotificationJobs.ts` بتحديد المهام وفق `Asia/Gaza` كما كان مقصوداً في تصميم الجدولة.

عنوان Go الداخلي من Express يمكن أن يختلف عن العنوان العام الذي تحتاجه GitHub Actions؛ لذلك اضبط قيمة السر بناءً على مكان الاستدعاء، أو استخدم عنوان HTTPS العام القابل للوصول من GitHub Actions.

## الاختبارات وحدود التحقق

- `gofmt` على الملفات الجديدة والمعدلة.
- اختبارات الحزم الداخلية الجديدة (Redis RESP، Activity Buffer، Views Buffer، Outbox، التقارير والمبيعات) نجحت.
- تم تشغيل جميع اختبارات Go و`go vet` باستخدام modfile مؤقت وstub محلي لمكتبة pgx بسبب منع الشبكة من تنزيل `github.com/jackc/pgx/v5` في بيئة الفحص. هذا يؤكد صحة ترجمة منطق التطبيق والاختبارات البرمجية، لكنه **لا يختبر pgx الحقيقي** ولا اتصال Render Redis الحقيقي.
- تعذر فحص TypeScript الكامل لأن `apps/api/node_modules` غير موجودة. مخرجات `tsc` التي أمكن تشغيلها توقفت عند الاعتماديات وأنواع Node/Prisma المفقودة.
- لم يتم تنفيذ استعلامات فعلية على Aiven أو اختبارات تكامل على PostgreSQL/Redis/Render. يجب تنفيذها في بيئة المشروع قبل تفعيل هذه المسارات إنتاجياً. خاصّةً يجب اختبار Redis TLS وACL مع عنوان Render الفعلي.
- تفريغ عدادات المشاهدات يحافظ على منطق GETDEL ثم استعادة `INCRBY` عند فشل SQL، مثل التصميم الموجود في Express. كما في أي نظام يفرغ Redis ثم يتلقى خطأ اتصال ملتبساً بعد احتمال نجاح COMMIT، يلزم اختبار تكامل على البيئة الحقيقية قبل اعتبار سيناريو انقطاع الشبكة بعد COMMIT مضموناً ضد الازدواج 100%.
- لا توجد هجرة Prisma جديدة في هذه المرحلة؛ التنفيذ يعتمد على جداول `outbox_events`, `user_activities`, `saved_searches`, `notifications`, `notification_push_dispatches` الموجودة في المخطط الحالي.
