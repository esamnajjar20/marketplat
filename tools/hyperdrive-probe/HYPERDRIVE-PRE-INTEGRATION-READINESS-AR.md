# تقرير فحص جاهزية MarketPlat قبل Hyperdrive

**مصدر الفحص:** ملف `marketplat-main.zip` المرفوع في 26 نوفمبر 2026.  
**النطاق:** التطبيقات ومصادر الاتصال وتهيئة Prisma وGo Worker وأدوات التشخيص والاختبار الموجودة في الأرشيف.  
**نوع الفحص:** مراجعة ملفات + تجهيز أدوات واختبارات محلية. لم تتوفر جلسة Aiven أو صلاحية Cloudflare أو متغيرات تشغيل الخدمات ضمن هذا الأرشيف.

## 1. النتيجة التنفيذية

**لا توجد جاهزية لربط خدمات الإنتاج بـ Hyperdrive حالياً.** لم يُغيّر مسار اتصال أي خدمة إنتاجية إلى Hyperdrive في هذه الحزمة.

النتيجة الأساسية التي تكشفها بنية المشروع:

- `apps/api` تطبيق Express/Node ينشئ `PrismaClient` من `DATABASE_URL`.
- `apps/go-worker` خدمة Go تستخدم `database/sql` مع Driver `pgx` من `GO_WORKER_DATABASE_URL` ثم `DIRECT_URL` ثم `DATABASE_URL`.
- `HYPERDRIVE` Binding موجود في `tools/hyperdrive-probe/wrangler.jsonc` وفي Worker المسبار فقط.
- لا تستخدم خدمات Express أو Go هذا الـ Binding، ولا تستطيع عملية Node/Go خارج Cloudflare Workers استهلاك Cloudflare Worker Binding مباشرة.

Hyperdrive مصمم ليُستهلك من كود يعمل داخل Cloudflare Workers عبر Binding يمرر connection string إلى Driver متوافق. لذلك لا يكفي إضافة Hyperdrive ID إلى `.env` في Express أو Go. يلزم تشغيل منطق قاعدة البيانات داخل Worker أو إعادة تصميم حدود الخدمة لتستدعي عمليات بيانات محددة عبر API داخلية ذات عقود واضحة. لا يُنصح بإنشاء جسر عام يقبل SQL مرسلاً من الخدمات.

## 2. ما فُحص في الأرشيف

| المجال | الموجود في النسخة | التقييم |
|---|---|---|
| Express / Prisma | Prisma Client مركزي، اتصال مباشر، connection_limit وpool_timeout | صالح لاستمرار الاتصال المباشر؛ أضيف وسم application_name |
| تعدد نسخ API | تقدير capacityCheck عبر DB_POOL_INSTANCES وDB_OTHER_CONNECTIONS | مفيد كتقدير إعدادات، وليس عدّاً حياً لكل خدمة |
| Prisma telemetry | query counters/histograms، slow queries، per-request query count، repeated read-shapes | موجود مسبقاً؛ لا يعادل pool-acquisition telemetry منفصلة |
| Go Worker | `database/sql` مع pgx، `DB_MAX_OPEN_CONNS`، max idle 1، idle lifetime دقيقتان | اتصال مباشر؛ أضيف application_name افتراضي |
| PostgreSQL diagnostics | phase18 وphase20 diagnostics | موجودة، وأضيف استعلام أشمل خاص ببوابة Hyperdrive |
| Hyperdrive Worker | pg Client لكل طلب، `SELECT 1`, binding HYPERDRIVE | Worker اختبار معزول، وليس جزءاً من خدمات API |
| Load tests | phase2/phase3 probes | متوفرة لقياس Hyperdrive منفرداً؛ أضيفت مقارنة Direct/Hyperdrive بحدود منخفضة |
| Aiven resources | لا توجد بيانات Metrics ضمن ZIP | يلزم قياس من Aiven Console |
| Cloudflare Analytics | لا توجد بيانات تشغيل من لوحة Cloudflare ضمن ZIP | يلزم قياس بعد النشر |

## 3. ما أُنجز في هذه الحزمة

1. إضافة `DB_APPLICATION_NAME` إلى مخطط البيئة في API، افتراضه `marketplat-api`، وتمريره إلى Prisma connection URL.
2. التحقق من اسم التطبيق: 1–63 محرف ASCII من الحروف والأرقام والنقطة والشرطة والشرطة السفلية.
3. إضافة `application_name=marketplat-go-worker` إلى URL الخاص بـ Go إذا لم يكن الاسم محدداً. يحتفظ Go بالاسم الصريح المحدد في URL.
4. إضافة اختبارات وحدة لـ Prisma URL وGo URL normalization.
5. إضافة `phase4-connection-monitor.sql` و`phase21-hyperdrive-readiness.sql` لتفريق `client backend` عن عمليات PostgreSQL الخلفية، وتحليل أسماء التطبيقات والحالات والانتظار والمعاملات والأقفال وعدادات قاعدة البيانات.
6. إضافة استعلام اختياري لـ `pg_stat_statements`.
7. إضافة مسار Direct محمي في Worker المسبار للمقارنة مع Hyperdrive، باستخدام نفس `pg` ونفس `SELECT 1`، دون كشف connection string أو قبول SQL من العميل.
8. إضافة سكربت `benchmark:compare` مع تقرير JSON ومقاييس p50/p95/p99، وبروفايل تحميل افتراضي منخفض: تزامن 1 و2، 20 طلباً لكل مستوى، 2 RPS لمدة 30 ثانية، طلب واحد مستمر قيد التنفيذ.
9. إضافة اختبارات للتهيئة وحساب المئينات ومسارات Worker.

## 4. حالة محاور القياس العشرة

| المحور | ما يمكن إثباته من الأرشيف | ما لا يزال يتطلب تشغيل/قياس |
|---|---|---|
| 1. PostgreSQL/Aiven | تجهيز استعلامات read-only لمعلومات الاتصالات والعدادات والأقفال والأحجام | CPU، RAM، disk I/O، network، limits الفعلية وقياسها أثناء الحمل |
| 2. Connection attribution | إضافة أسماء تطبيقات API وGo والمسبارين | نشر الخدمات وإعادة تشغيلها والتحقق من ظهور الأسماء الفعلية |
| 3. Hyperdrive pooling | وجود Probe سابق وتهيئة المقارنة | نشر نسخة Worker الجديدة والتقاط snapshots قبل/أثناء/بعد Direct وHyperdrive |
| 4. Latency | سكربت يحسب زمن العميل والاتصال والاستعلام وWorker ومئيناتها | نتائج تشغيلية حقيقية متكررة |
| 5. Concurrency/load | حدود اختبار مضبوطة وآمنة بشكل افتراضي | تشغيل الاختبارات ومراجعة Aiven connection headroom أولاً |
| 6. Resources | توثيق مصادر القياس المطلوبة | أرقام Aiven وCloudflare الفعلية |
| 7. Reliability | اختبارات مسارات أخطاء ضمن Worker والاختبارات المحلية | انقطاع شبكة/تعافي/ضغط حقيقي في Staging مع مراقبة |
| 8. Runtime compatibility | حُددت حدود معمارية الخدمات الحالية | إثبات نموذج Worker بديل للعمليات الفعلية؛ لا يكفي `SELECT 1` |
| 9. Security/data safety | المسارات محمية وتقبل SQL ثابتاً فقط، ولا تغيّر schema أو البيانات | مراجعة الأسرار في Cloudflare/الأذونات الفعلية واختبارات صلاحيات runtime |
| 10. Rollback/operations | الخطة تمنع تغيير اتصالات الإنتاج في هذه الحزمة | نشر تجريبي، rollback عملي، وتأكيد runbook مع مشغل النشر |

## 5. مانع توافق مؤكد في Go Worker — Session-level advisory locks

ظهر في التدقيق الساكن أن Go Worker يستخدم أقفال PostgreSQL على مستوى الجلسة في موضعين:

- `apps/go-worker/cmd/server/joblock.go`: يحجز `*sql.Conn` مخصصاً ويستعمل `pg_try_advisory_lock($1)` ثم `pg_advisory_unlock($1)` قبل إعادة الاتصال إلى المجمع.
- `apps/go-worker/internal/searchindex/index.go`: يستعمل أيضاً `pg_try_advisory_lock` و`pg_advisory_unlock` على اتصال مثبت.

هذا ليس تفصيلاً ثانوياً: Hyperdrive يستخدم transaction pooling ولا يدعم أقفال الجلسة `pg_advisory_lock`/`pg_try_advisory_lock`؛ تحذر Cloudflare من أن القفل قد يبقى على اتصال origin المعاد إلى التجمع ويؤثر في عملاء آخرين. لذلك **Go Worker الحالي غير مؤهل للتحويل إلى Hyperdrive كما هو**. يجب أن يبقى على اتصال مباشر/session، أو يُعاد تصميم عمر القفل والمعاملة بعناية إلى transaction-level advisory locks حيث يمكن ضمان أن كامل العمل يقع داخل معاملة صريحة واحدة وتنتهي قبل إعادة الاتصال. لا تغيّر هذه الدلالات تلقائياً لأنها تحمي منع تشغيل jobs المكررة.

وجد التدقيق في أجزاء أخرى من Go أيضاً أقفالاً transaction-level مثل `pg_try_advisory_xact_lock` في inventory monitor وfraud monitor وoutbox events وanalytics rollup. هذه لا تزيل المانع السابق؛ وجود أي مسار session-level يجعل تمرير اتصال الخدمة كلها عبر transaction pool غير آمن.

في Express/Prisma، أنماط الأقفال الخام التي وجدها البحث تستخدم `pg_advisory_xact_lock` أو `pg_try_advisory_xact_lock` داخل `$transaction`، ولم يظهر استدعاء تنفيذي مباشر لأقفال session-level في هذه المطابقة. هذا مؤشر توافق جزئي فقط، وليس إثباتاً كاملاً؛ يلزم تدقيق بقية سلوك Prisma/الاتصال والـ transactions.

## 6. أثر إعدادات Hyperdrive على قاعدة Aiven الصغيرة

توثيق Cloudflare يذكر أن أقل قيمة قابلة للضبط لحد اتصالات origin في Hyperdrive هي 5، وأن الحد soft وليس سقفاً صارماً في جميع ظروف الاستعادة/الضغط. هذا لا يعني أن خمس جلسات ستظهر دائماً في `pg_stat_activity`؛ Hyperdrive يوسّع/يدير المجموعة بحسب الحمل. لكنه يعني ضرورة إدراج ميزانية Hyperdrive ضمن حد Aiven البالغ 20، وعدم تخصيص كل السعة لمجمعات Express/Go مع ترك هامش صفري.

## 7. الأرقام السابقة وحدود دلالتها

بحسب القياسات التي أرسلها المستخدم في المحادثة:

- `max_connections` أظهر 20.
- لقطة واحدة أظهرت 3 اتصالات باسم `marketplat-hyperdrive-probe`.
- لقطات سابقة أظهرت 4 كحد أعلى مرصود في عينات Hyperdrive.
- benchmark السابق للمسبار استعمل `SELECT 1` وبلغ تزامناً HTTP حتى 50.

هذه الأرقام لا تثبت الذروة الحقيقية لعدد اتصالات Hyperdrive؛ أخذ العينات لم يكن مستمراً. ولا تسمح بحساب انخفاض إجمالي اتصالات تطبيقات الإنتاج لأن الاتصالات المباشرة لم تُختبر تحت حمل مطابق في نفس نافذة القياس. كذلك `COUNT(*)` على `pg_stat_activity` يشمل عمليات خادم ليست `client backend`؛ افصلها باستخدام `backend_type`.

## 8. تحذير معماري قبل اتخاذ قرار الربط

الهدف الحالي هو ربط أربع خدمات Express وGo Worker. بنية هذه الحزمة لا تعمل داخل Cloudflare Workers؛ هي خوادم Node/Go. Hyperdrive Binding ليس عنوان PostgreSQL عامّاً يمكن لعملية خارج Worker الاتصال به. لا تنقل `DATABASE_URL` إلى `HYPERDRIVE.connectionString` ولا تضع Hyperdrive ID على أنه عنوان اتصال.

المسارات المعمارية الممكنة التي تحتاج قراراً منفصلاً:

1. إبقاء Express وGo على PostgreSQL مباشرة، مع ضبط أحجام المجمعات وقياسها، ودراسة pooler على جانب قاعدة البيانات إن كان مناسباً ومدعوماً بخطة Aiven.
2. نقل عمليات بيانات محددة إلى Cloudflare Workers، وتوفير API داخلية محددة النوع والعمليات بدلاً من تمرير SQL عام.
3. نقل خدمة كاملة إلى Workers only بعد مراجعة توافق جميع dependencies/runtime وPrisma وإدارة الاتصالات.

لا يتم تنفيذ أي من هذه الخيارات تلقائياً ضمن هذه الحزمة.

## 9. خطوات التحقق المحلية

من جذر المشروع:

```bash
cd tools/hyperdrive-probe
npm ci
npm run check
npm run test:compare
```

في Go Worker:

```bash
cd apps/go-worker
gofmt -w cmd/server/database.go cmd/server/database_test.go
go test ./cmd/server
```

وفي API بعد تثبيت اعتماداته:

```bash
cd apps/api
npm run test:unit -- --runInBand --runTestsByPath tests/unit/prismaPoolConfig.test.ts
```

قد تختلف خيارات Jest حسب إصدار المشروع؛ إن رفض الأمر `--runInBand` أو `--runTestsByPath` شغّل ملف الاختبار مباشرة عبر إعداد Jest في الحزمة.

## 10. خطوات القياس التشغيلي المطلوبة من المشغل

1. خذ baseline من `phase21-hyperdrive-readiness.sql` قبل أي تحميل.
2. انشر API وGo بتغييرات application_name فقط، من دون تغيير عنوان قاعدة البيانات.
3. خذ snapshot وتأكد أن أسماء الخدمات الخمس تظهر منفصلة. خصص قيمة `DB_APPLICATION_NAME` مختلفة لكل نشر API؛ ولا تستخدم الاسم الافتراضي نفسه لكل الخدمات.
4. سجل من لوحة Aiven CPU/RAM/Disk/Network/connection metrics في النافذة نفسها.
5. أضف سر `DIRECT_DATABASE_URL` إلى Worker المسبار من Wrangler دون وضع السر في الملفات.
6. شغّل اختبارات Worker المحلية، ثم انشر Worker التجريبي فقط.
7. خذ snapshot أثناء Direct، ثم أثناء Hyperdrive، ثم بعد كل تشغيل. لا تشغلهما بالتوازي.
8. كرر القياس مرتين على الأقل. ابدأ بالملف الافتراضي المنخفض ولا تصعّد التزامن قبل مراجعة عدد client backends.
9. قارن التقارير وسجلات Aiven/Cloudflare، ثم قرر هل تستحق أي عملية محددة نقلها إلى Worker.

## 11. قرار الجاهزية

**القرار الحالي: NO-GO لربط Express/Go مباشرة بـ Hyperdrive.**

السبب ليس فشل Hyperdrive؛ بل لأن Binding لا يتوفر لهذه العمليات خارج Workers، ولأن قياسات Aiven/الموارد والمقارنة المباشرة المتزامنة غير متاحة في ملف ZIP. حزمة الكود تحسن attribution وتجهز اختبار مقارنة آمن من داخل Worker، لكنها لا تُعدّ نتائج تشغيلية ولا تنشر الخدمات.
