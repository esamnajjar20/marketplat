# تقرير المرحلة التالية — سجل فحوصات Fraud Monitor والاتجاهات

**المشروع:** MarketPlat  
**النطاق:** Go Worker + Express API + Prisma/PostgreSQL + لوحة المشرف  
**النسخة الأساس:** `marketplat-go-fraud-monitor-engine.zip`  
**الحالة:** التعديلات البرمجية أُنجزت محليًا؛ لم تُطبّق Migration على قاعدة الإنتاج ولم يحدث نشر.

---

## 1. هدف المرحلة

كانت المرحلة السابقة تنفّذ فحصًا يدويًا لأنماط إساءة الاستخدام وتعيد النتائج للمشرف، لكنها لا تحفظ تاريخ التنفيذ ولا تسمح بمقارنة نتائج الفحوصات مع بعضها. أضافت هذه المرحلة سجلًا دائمًا للفحوصات، وتشغيلًا يوميًا مجدولًا، وملخصًا لاتجاه التغيّر، مع عدم الاحتفاظ بهويات العينات أو نصوص البلاغات في سجل التاريخ.

لا يحظر النظام حسابات، ولا يخفي إعلانات، ولا يغيّر حالة بلاغ أو درجة مخاطر. النتائج مؤشرات للمراجعة البشرية فقط.

## 2. ما تم تنفيذه

### أ. سجل الفحوصات في PostgreSQL

أضيفت Migration:

`apps/api/prisma/migrations/20261102150000_add_fraud_monitor_history/migration.sql`

وتحدّث `apps/api/prisma/schema.prisma` بموديلين:

- `FraudMonitorScanRun`: سجل تشغيل واحد، يتضمن نوع التشغيل (`MANUAL` أو `SCHEDULED`)، التاريخ المجدول، الحالة، مسار التنفيذ (`GO` أو `EXPRESS`)، أوقات البدء والانتهاء، المدة، المجاميع، عدد المحاولات ورمز الفشل.
- `FraudMonitorCheckSnapshot`: ملخص لكل نمط فحص ضمن التشغيل، ويتضمن كود النمط وشدته وعدد الحالات وعدد العينات التي كانت موجودة في نتيجة الفحص.

**تقليل البيانات:** لا يُخزّن السجل `userId` أو `targetId` أو نصوص البلاغات أو الأسماء أو عناوين البريد أو أرقام الهاتف أو محتوى الإعلانات. التخزين تاريخي وتجميعي فقط.

**منع التكرار:** `scheduledFor` عليه قيد فريد؛ لذلك لا يمكن إنشاء أكثر من سجل مجدول مكتمل للتاريخ المحلي نفسه. إعادة المحاولة تعيد استخدام السجل الفاشل أو سجل `RUNNING` القديم بعد 45 دقيقة، بدل إنشاء سجل يومي مكرر.

**الاحتفاظ:** تُحفظ سجلات التاريخ 180 يومًا. التشغيل اليومي يحوّل سجلات `RUNNING` التي تجاوزت 45 دقيقة إلى `FAILED`، ثم يحذف السجلات المنتهية الأقدم من 180 يومًا، وتحذف ملخصاتها التابعة عبر `ON DELETE CASCADE`.

### ب. تدفق التنفيذ Go-first / Express fallback

التدفق أصبح كما يلي:

1. يطلق Go Scheduler المهمة المجدولة ضمن قائمة المهام المسموح بها.
2. يستدعي Go محول Express الداخلي لتشغيل سكربت TypeScript المترجم، حفاظًا على تكاملات Express الحالية.
3. يسجل السكربت تشغيل الفحص في PostgreSQL.
4. يطلب Express نتيجة الفحص من Go عبر `POST /internal/fraud/monitor/scan`.
5. إذا أعاد Go نتيجة صحيحة، يسجل التاريخ أن التنفيذ تم عبر `GO`.
6. عند تعذّر Go أو انتهاء مهلته أو إرجاع نتيجة غير صالحة، ينفذ Express استعلامات القراءة الاحتياطية نفسها ويسجل المسار `EXPRESS`.
7. تحفظ المجاميع الأربعة وملخصاتها وتتحول حالة التشغيل إلى `COMPLETED` في معاملة واحدة.

يستخدم Go وExpress قفل PostgreSQL استشاريًا واحدًا على مستوى المعاملة (`731904303`) حتى لا يعمل الفحصان بالتوازي عند حدوث timeout ملتبس. كما أن المعاملة الاحتياطية في Express للقراءة فقط وبمستوى `REPEATABLE READ`.

### ج. الجدولة اليومية

أضيفت المهمة:

`report:fraud-monitor`

إلى:

- Go Scheduler في `apps/go-worker/internal/scheduler/scheduler.go`.
- جدول Express الاحتياطي في `apps/api/src/scripts/runScheduledJobs.ts`.
- قائمة سكربتات الإنتاج المسموح بها في `apps/api/src/scripts/childJobRunner.ts`.
- سكربت التنفيذ `apps/api/src/scripts/fraudMonitor.ts`.
- `apps/api/package.json`.

الوقت `07:45 Asia/Gaza` هو بيانات تعريفية للمهمة ضمن جدول المهام الحالي؛ التنفيذ الفعلي يتم مع استدعاء GitHub Actions اليومي الموجود أصلًا (`04:00 UTC`) ويطبّق قواعد التاريخ المحلي وفترة التعويض اليومية المستخدمة في المجدول. لا يعني ذلك أن المهمة تبدأ بالضرورة عند 07:45 بالضبط.

أُبقي تشغيل Go الأساسي ومسار Express الاحتياطي متطابقين، مع تمرير التاريخ المحلي `scheduledFor` إلى السكربت. كما أُصلح اختبار قائمة المهام ليغطي جميع المهام الثماني عشرة، بما فيها `inventory-monitor` التي كانت غير مذكورة في خريطة الاختبار رغم وجودها في المجدول والـallowlist.

### د. سجل الاتجاهات في لوحة المشرف

أضيف endpoint للمشرفين:

`GET /admin/fraud/monitor/history`

ويعيد آخر 14 تشغيلًا، ويتضمن لكل تشغيل حالته ومساره ومدته والمجاميع وعدد المحاولات ورمز الفشل وملخصات أنماط الفحص. كما يقارن آخر تشغيلين ناجحين لكل نمط، ويعرض الفرق العددي صعودًا أو هبوطًا.

في `FraudMonitorPanel`:

- تحميل السجل لا يشغّل فحصًا جديدًا.
- زر الفحص اليدوي يظل إجراءً صريحًا من المشرف.
- بعد الفحص اليدوي يُحدّث السجل تلقائيًا.
- تظهر آخر 8 عمليات من السجل، مع بطاقات مقارنة الاتجاهات.
- لا تعرض شاشة التاريخ عينات المعرّفات؛ العينات تبقى في استجابة الفحص الحالي فقط، ولا تنسخ إلى الجداول التاريخية.

### هـ. تصحيح منطق نافذة تجمّع البلاغات

أثناء المراجعة اكتشفت أن كاشف `REPORT_TARGET_BURST` كان يقارن أول وآخر بلاغ ضمن نافذة الست ساعات كلها. هذا قد يفوّت خمس بلاغات متقاربة إذا وُجد بلاغ منفصل أقدم أو أحدث.

عُدّل الاستعلام في Go وExpress ليبحث عن أفضل نافذة متحركة مدتها ساعتان لكل هدف، ثم يعيد نافذة واحدة مرتبة حسب أكبر عدد من المبلّغين. أضيف اختبار ثابت للتأكد من وجود منطق النافذة المتحركة، وتم التحقق أن SQL الخاص بالفحوصات الأربعة متطابق بين Go وExpress بعد تطبيع المسافات.

### و. تشخيص جاهزية Go

تحديث `/internal/diagnostics` بحيث لا تعلن `fraudMonitoring: ready` إلا عند وجود:

- جدول البلاغات وإشارات الاحتيال والمستخدمين.
- فهرس البلاغات المستخدم في الفحص.
- جدولي سجل التشغيل وملخصات أنماط الفحص.

إذا لم تُطبّق الـMigrations المطلوبة فستظهر حالة `missing`/`degraded` بدل اعتبار النظام جاهزًا.

## 3. الملفات المعدلة والمضافة

### API / Prisma

- `apps/api/package.json`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20261102150000_add_fraud_monitor_history/migration.sql` **(جديد)**
- `apps/api/src/app.ts`
- `apps/api/src/modules/fraud/fraud-monitor.service.ts`
- `apps/api/src/modules/fraud/fraud.controller.ts`
- `apps/api/src/modules/fraud/fraud.routes.ts`
- `apps/api/src/scripts/childJobRunner.ts`
- `apps/api/src/scripts/fraudMonitor.ts` **(جديد)**
- `apps/api/src/scripts/runScheduledJobs.ts`
- `apps/api/src/shared/go-worker/requestJsonWithFallback.ts`
- `apps/api/tests/unit/childJobRunner.test.ts`
- `apps/api/tests/unit/fraud-monitor.history.test.ts` **(جديد)**

### Go Worker

- `apps/go-worker/README.md`
- `apps/go-worker/cmd/server/main.go`
- `apps/go-worker/internal/fraudmonitor/scan.go`
- `apps/go-worker/internal/fraudmonitor/scan_test.go`
- `apps/go-worker/internal/scheduler/scheduler.go`
- `apps/go-worker/internal/scheduler/scheduler_test.go`

### Frontend

- `frontend/api/admin.api.ts`
- `frontend/components/admin/FraudMonitorPanel.tsx`
- `frontend/types/admin.types.ts`
- `frontend/__tests__/components/FraudMonitorPanel.test.tsx`

## 4. نتائج التحقق المنفذة

| الفحص | النتيجة |
|---|---|
| `go test ./internal/...` | نجح لجميع الحزم الداخلية |
| `go test -race ./internal/scheduler ./internal/fraudmonitor` | نجح |
| فحص صياغة TypeScript عبر `transpileModule` لـ 15 ملفًا معدلًا/مرتبطًا | صفر أخطاء صياغة |
| تحليل `apps/api/package.json` | JSON صالح |
| تطابق أسماء المهام بين Go وExpress والـproduction allowlist وخريطة اختبارها | 18/18 متطابقة |
| تطابق SQL للفحوصات الأربعة بين Go وExpress | متطابق بعد تطبيع whitespace |

### ما لم يتم التحقق منه

- لم تعمل اختبارات Jest/Vitest؛ لا توجد مجلدات `node_modules` في نسخة العمل.
- فحص `transpileModule` هو فحص صياغة، وليس بديلًا عن `tsc --noEmit` أو التحقق الكامل من أنواع TypeScript.
- لم يتم تشغيل `prisma validate` أو `prisma generate`؛ Prisma CLI غير موجود في نسخة العمل.
- لم يتم تطبيق الـMigration على Aiven أو إجراء اختبار SQL على PostgreSQL فعلي.
- لم يكتمل بناء خادم Go `cmd/server` في هذه البيئة لأن تبعية `github.com/jackc/pgx/v5` لم تكن قابلة للتنزيل بسبب تعذر الوصول إلى `proxy.golang.org`. نجاح اختبارات `internal/...` لا يثبت بناء الخادم الكامل.
- لم يحدث نشر على Render أو تشغيل فعلي لمهمة GitHub Actions.

## 5. خطوات الإطلاق المطلوبة

نفّذها من مجلد `apps/api` على بيئة الإصدار بعد التأكد من إعداد `DATABASE_URL` و`DIRECT_URL`:

```bash
npm ci
npx prisma migrate deploy
npx prisma generate
npm run build
```

يجب أن تتضمن قاعدة البيانات Migration فهرس البلاغات السابقة:

`20261102143000_add_fraud_monitor_report_index`

ثم Migration التاريخ الجديدة:

`20261102150000_add_fraud_monitor_history`

بعدها:

1. انشر Express API وGo Worker ضمن إصدار متوافق واحد.
2. تأكد من توفر `GO_WORKER_URL` و`GO_WORKER_TOKEN` في Express، ومن `GO_WORKER_TOKEN` و`GO_WORKER_DATABASE_URL` (أو إعداد اتصال PostgreSQL الحالي المعتمد) في Go.
3. افحص `/internal/diagnostics` وتأكد من ظهور `fraudMonitoring: ready`.
4. افتح لوحة Fraud كمشرف، وشغّل فحصًا يدويًا، ثم تحقق من ظهور السجل وحفظ المجاميع.
5. راقب أول تشغيل يومي من GitHub Actions، وتحقق أن `executionPath` يسجل `GO` عند نجاح Go أو `EXPRESS` عند استخدام الاحتياط.

**لا تنفذ قرارات حظر تلقائية اعتمادًا على هذه المؤشرات.** عتبات الفحص heuristics وتحتاج مراجعة بشرية وتقييمًا واقعيًا بعد جمع بيانات تشغيلية كافية.

---

## 6. الخلاصة

أصبحت مراقبة الاحتيال تدعم سجلًا تاريخيًا تجميعيًا، تشغيلًا يوميًا idempotent، إعادة المحاولة، مقارنة الاتجاهات، واحتفاظًا محدودًا لمدة 180 يومًا. كما جرى تصحيح نافذة تجمّع البلاغات وتوسيع اختبار اتساق المجدول إلى 18 مهمة. التنفيذ البرمجي جاهز للمراجعة والإطلاق المرحلي، لكنه **ليس منشورًا ولا مُختبرًا على قاعدة PostgreSQL الإنتاجية** حتى الآن.
