# المرحلة الخامسة — مقارنة الاتصال المباشر مع Hyperdrive

## الغرض والنطاق

تقارن هذه المرحلة اتصالين من **Cloudflare Worker نفسه** إلى قاعدة PostgreSQL:

1. اتصال مباشر باستخدام السر `DIRECT_DATABASE_URL`.
2. اتصال عبر Binding باسم `HYPERDRIVE`.

يستخدم المساران `node-postgres (pg)` ونفس الاستعلام الثابت للقراءة فقط `SELECT 1::int AS ok`، مع إنشاء Client لكل طلب وإغلاقه بعده. لا يتم تمرير SQL من العميل، ولا توجد عمليات كتابة أو معاملات تطبيقية.

**هذه ليست مقارنة لتطبيق Express/Prisma أو Go Worker.** إنها تعزل أثر المسار الشبكي وتجميع Hyperdrive. لا تثبت وحدها أن استعلامات MarketPlat الحقيقية أو ORM ستعمل عبر Hyperdrive.

## قيد معماري حاسم

`HYPERDRIVE` Binding متاح داخل Cloudflare Workers runtime. خدمات `apps/api` الحالية تعمل كخادم Express/Node، و`apps/go-worker` كخدمة Go عادية؛ لا تستطيع هذه العمليات خارج Workers استهلاك Binding مباشرة بمجرد وضع Hyperdrive ID أو URL في متغير بيئة. يتطلب استخدام Hyperdrive نقل كود الوصول إلى قاعدة البيانات إلى Worker (أو إعادة تصميم جزء من المعمارية ليكون Worker مسؤولاً عن عمليات بيانات محددة)، وليس إنشاء HTTP endpoint عام يقبل SQL من Express/Go.

لهذا السبب نحتفظ بخدمات Express وGo على اتصالها الحالي خلال كل الاختبارات. لا تنقل `DATABASE_URL` إليها إلى عنوان Worker، ولا تنشئ SQL-over-HTTP proxy عام.

## مانع خاص بـ Go Worker

مراجعة الكود وجدت أن `apps/go-worker/cmd/server/joblock.go` و`apps/go-worker/internal/searchindex/index.go` يستخدمان session-level advisory locks (`pg_try_advisory_lock` و`pg_advisory_unlock`) على اتصال مثبت. Hyperdrive يعمل بـ transaction pooling ولا يدعم هذه الأقفال؛ لا توجّه Go Worker الحالي إلى Hyperdrive. يلزم أن يبقى هذا المسار على اتصال مباشر/session أو أن تتم إعادة هندسة الأقفال إلى transaction-level locks مع اختبار دلالات التزامن والتراجع قبل أي نقل. راجع تقرير الجاهزية.

## متطلبات النشر

الـ Worker الحالي يستخدم Binding `HYPERDRIVE` والسر `HYPERDRIVE_PROBE_TOKEN`. أضف سر الاتصال المباشر لنفس قاعدة Aiven من مجلد `tools/hyperdrive-probe`:

```bash
npx wrangler secret put DIRECT_DATABASE_URL
```

أدخل رابط PostgreSQL مباشرة عند مطالبة Wrangler، ولا تضعه في ملف أو Git أو المحادثة. تأكد أنه نفس قاعدة البيانات والهوية/الصلاحيات المستخدمة في اختبار Hyperdrive قدر الإمكان، ويحتوي إعداد TLS الصحيح الذي يتطلبه Aiven.

بعد دمج التعديلات:

```bash
npm ci
npm run check
npm run deploy
```

نشر Worker التجريبي فقط. لا ينشر Express ولا Go ولا يغيّر إعداداتهم الإنتاجية.

## نقاط النهاية

- Hyperdrive: `POST /__internal/db-probe`
- Direct: `POST /__internal/direct-db-probe`
- Health: `GET /health` (لا ينفذ اتصالاً بقاعدة البيانات)

كلا مساري قاعدة البيانات يتطلبان Bearer Token نفسه. لا يعيدان عنوان الاتصال أو تفاصيل الخطأ الخام.

## تشغيل المقارنة

من مجلد `tools/hyperdrive-probe`:

```bash
export PHASE5_DIRECT_PROBE_URL='https://<worker-host>.workers.dev/__internal/direct-db-probe'
export PHASE5_HYPERDRIVE_PROBE_URL='https://<worker-host>.workers.dev/__internal/db-probe'
read -rsp 'Worker token: ' HYPERDRIVE_PROBE_TOKEN
echo
export HYPERDRIVE_PROBE_TOKEN
npm run benchmark:compare
```

الملف المحلي `reports/phase5-connection-comparison-<timestamp>.json` يحوي p50/p95/p99/min/mean/max لزمن العميل ووقت الاتصال والاستعلام ووقت Worker، ومعدل الأخطاء والطلبات في الثانية.

### ملف الحمل الافتراضي الآمن

| الإعداد | الافتراضي | الحد الأعلى المدمج |
|---|---:|---:|
| التزامن | 1 و2 | 5 |
| الطلبات لكل مستوى | 20 | 60 |
| التسخين لكل مسار | 1 | 2 |
| الحمل المستمر | 30 ثانية | 120 ثانية |
| معدل الحمل المستمر | 2 RPS | 5 RPS |
| الطلبات المستمرة قيد التنفيذ | 1 | 2 |
| مهلة الطلب | 12 ثانية | ثابتة |
| إعادة المحاولة | 0 | 0 |

هذه الحدود محافظة لأن آخر قيمة `max_connections` أبلغ عنها المستخدم كانت 20، ولم يكن لدينا حينها قياس موثوق لعدد جلسات العملاء فقط. لا ترفعها قبل أخذ baseline ومراقبة الجلسات. لا تشغّل أكثر من اختبار واحد في الوقت نفسه.

يمكن تعطيل الحمل المستمر:

```bash
PHASE5_ENABLE_SUSTAINED=false npm run benchmark:compare
```

ويمكن تحديد مستويات ضمن الحد الآمن:

```bash
PHASE5_CONCURRENCY_LEVELS=1,2,5 PHASE5_REQUESTS_PER_LEVEL=30 npm run benchmark:compare
```

## مراقبة PostgreSQL بالتزامن

شغّل `apps/api/prisma/diagnostics/phase21-hyperdrive-readiness.sql` قبل الاختبار وأثناءه وبعده. راقب خصوصاً:

- `client_backends` لا `visible_activity_rows` وحدها.
- `application_name` لكل من `marketplat-direct-probe` و`marketplat-hyperdrive-probe`.
- الاتصالات النشطة والخاملة والخاملة داخل المعاملة.
- الاتصالات لكل عنوان عميل واسم تطبيق.
- blockers ومدة الاستعلامات الطويلة.

داخل `psql` يمكن إعادة آخر استعلام كل ثانية باستخدام `\\watch 1`، وإيقافه بـ Ctrl+C. جلسة المراقبة نفسها تُحتسب كجلسة عميل. لا تخلط ناتج `pg_stat_activity` الكلي بعدد client backends؛ لكل صف في العرض عملية خادم وقد تكون العملية من نوع backend غير عميل.

## قياسات خارج SQL

سجّل من Aiven Metrics خلال نافذة الحمل نفسها:

- CPU utilization وRAM utilization.
- اتصالات PostgreSQL والحدود/الرفض.
- قراءة/كتابة القرص وعمليات I/O إن عرضها الخطة.
- Network throughput إن توفر.
- Storage usage.

وسجّل من Cloudflare Worker Analytics/Observability:

- عدد الطلبات، الأخطاء، والمهلات.
- CPU time / مدة تنفيذ Worker المتاحة في لوحة الخطة.
- عدد الطلبات الفاشلة وحالة النشر.

هذه المقاييس لا يمكن استخراجها بأمان من ملف المشروع؛ يلزم الوصول إلى لوحتي Aiven وCloudflare.

## تفسير المقارنة

- قارن النوافذ المتناظرة فقط، وعلى قاعدة البيانات نفسها، وبنفس Worker region، والـ driver، والاستعلام.
- نتيجة Direct قد تنشئ جلسة PostgreSQL لكل HTTP request تقريباً، بينما Hyperdrive يعيد استخدام اتصالات origin. راقب ذلك فعلياً في SQL ولا تستنتجه من عدد الطلبات.
- لا تستنتج كفاءة التجميع من عينة واحدة؛ التقط snapshots قبل/أثناء/بعد، وكرر المقارنة مرتين على الأقل.
- `p95/p99` والأخطاء والاتصالات أهم من throughput الأقصى منفرداً.
- `SELECT 1` لا يختبر المعاملات أو lock behavior أو prepared statements أو استعلامات المنتج الفعلية.

## بوابة قبول المرحلة الخامسة

لا تجتاز المرحلة إلا بعد توفر جميع الأدلة التالية:

- Direct warm-up وHyperdrive warm-up ناجحان.
- لا أخطاء اتصال/مهلة غير مفسرة.
- قياس client backend counts قبل/أثناء/بعد كل مسار.
- توثيق CPU/RAM/Network في Aiven وWorker Analytics إن كانت المقاييس متاحة.
- لا يوجد `idle in transaction` أو اتصال مستمر غير مفسر بعد إيقاف الحمل.
- وجود تقريرين متكررين على الأقل بنتائج متقاربة.
- عدم وجود تدهور غير مقبول في p95/p99.

## حدود ما لا تغطيه

- لا تنفذ عمليات CRUD أو اختبارات كتابة.
- لا تقيس حمل التطبيق الفعلي أو API routes.
- لا تثبت توافق Prisma 5.22 مع تصميم Worker الإنتاجي.
- لا تربط Express أو Go بـ Hyperdrive؛ يلزم قرار معماري منفصل لأن Binding خاص بـ Workers.
- لا تغيّر الإعدادات أو secrets الإنتاجية للخدمات.

بعد اجتياز هذه المرحلة، الخطوة التالية ليست النقل الجماعي. يجب بناء نموذج Worker مسؤول عن مجموعة محددة من عمليات القراءة/الكتابة ذات عقود API واضحة، ثم اختبار السلوك والمعاملات والصلاحيات قبل أي تحويل مرور إنتاجي.
