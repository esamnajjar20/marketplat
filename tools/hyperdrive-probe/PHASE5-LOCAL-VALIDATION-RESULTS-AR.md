# تقرير التحقق المحلي — جاهزية Hyperdrive

تاريخ التقرير: 2026-11-26

## ما تم التحقق منه محلياً

| الفحص | النتيجة | حدود النتيجة |
|---|---|---|
| اختبارات Worker والمقارنة | 32 ناجحة، 0 فاشلة | اختبارات محلية بمصنع قاعدة بيانات وهمي؛ لا تتصل بـ Aiven |
| فحص صياغة TypeScript | الملفات السبعة المعدلة اجتازت `transpileModule` دون أخطاء صياغة | ليس `tsc` ولا فحص أنواع كاملاً |
| فحص صياغة سكربت المقارنة | `node --check` ناجح | لا يشغّل المقارنة الشبكية |
| فحص JSON | `tools/hyperdrive-probe/package.json` صالح | لا يثبت تثبيت الاعتماديات |
| Prisma URL helper | 8 assertions وقت تشغيل ناجحة | لا يشغّل Prisma Client ولا يفتح اتصال DB |
| Go URL normalization | اختباران معزولان ناجحان باستخدام `go test` مع stub صغير لـ config | ليس اختبار الحزمة الكاملة ولا يثبت تسجيل pgx الفعلي |
| Go formatting | `gofmt -d` بلا تغييرات | ليس compile أو test للحزمة الكاملة |

## قيود بيئة التحقق

- Node الموجود هو `v22.16.0` بينما `tools/hyperdrive-probe/package.json` يطلب `>=22.18 <25`. الاختبارات اجتازت على 22.16، لكن يجب إعادة `npm ci` و`npm run check` على إصدار ضمن النطاق المعلن قبل الدمج.
- لم تتوفر اعتماديات API/Go/Worker كاملة في الذاكرة المحلية. محاولة التثبيت دون اتصال لم تنجح بسبب غياب حزم من cache؛ لذلك لم يكتمل Jest أو `go test ./cmd/server` للحزمة كاملة أو `tsc --noEmit`.
- لم يتم الاتصال بـ Aiven أو Cloudflare من بيئة العمل، ولم يتم نشر Worker أو أي خدمة إنتاج.
- لم تُلتقط Metrics فعلية لـ CPU/RAM/Storage/Network/Cloudflare، ولم ينفذ Direct-vs-Hyperdrive benchmark الحي.

## تغييرات الكود

- API: `DB_APPLICATION_NAME` يضبط PostgreSQL `application_name` في Prisma URL.
- Go: يضيف `marketplat-go-worker` إذا لم يكن `application_name` محدداً ويحافظ على الاسم المخصص.
- Probe Worker: endpoint مباشر محمي `POST /__internal/direct-db-probe` بجانب endpoint Hyperdrive، وكلاهما ينفذ `SELECT 1::int AS ok` فقط.
- مقارنة: `scripts/compare-connections.mjs` يولد تقرير JSON لمئينات latency والأخطاء وRPS، مع تحميل افتراضي منخفض وحدود قصوى مدمجة.
- SQL: استعلامات read-only تميز `client backend` عن عمليات PostgreSQL الخلفية وتفحص الجلسات والانتظار والأقفال والعدادات.

## مانعان يمنعان الربط الحالي

1. خدمات Express/Go تعمل خارج Cloudflare Workers ولا تستطيع استخدام `HYPERDRIVE` Binding مباشرة. تحتاج إعادة تصميم لتشغيل منطق DB داخل Worker أو واجهة داخلية محددة الوظائف؛ لا تستخدم proxy عاماً يقبل SQL.
2. Go Worker يستخدم session-level advisory locks في `joblock.go` و`internal/searchindex/index.go`. نمط Hyperdrive transaction pooling لا يدعم هذه الأقفال، لذا يجب إبقاء Go على اتصال مباشر حالياً أو إعادة تصميم هذه الأقفال واختبار دلالاتها قبل أي نقل.

## الخطوات التشغيلية التي لا تزال مطلوبة

1. استخدم `apps/api/prisma/diagnostics/phase21-hyperdrive-readiness.sql` على Aiven قبل وأثناء وبعد الحمل.
2. اضبط `DB_APPLICATION_NAME` بقيمة فريدة لكل نشر Express، وأعد تشغيله ثم تحقق من `pg_stat_activity`.
3. على Worker المسبار، أضف `DIRECT_DATABASE_URL` كـ Cloudflare Secret تفاعلياً؛ لا تحفظه في الملفات أو Git ولا ترسله في المحادثة.
4. أعد تثبيت الاعتماديات على Node 22.18+ وشغّل `npm run check`، ثم انشر Worker المسبار فقط.
5. شغّل `npm run benchmark:compare` مع مراقبة Aiven، وكرر المقارنة مع snapshots قبل وأثناء وبعد كل مسار.
6. لا تُحوّل أي خدمة إنتاجية إلى Hyperdrive قبل تقرير توافق خاص بتلك الخدمة وخطة rollback مجرّبة.

## القرار

**NO-GO للربط الإنتاجي حالياً.** الكود المحلي وأدوات القياس أُعدت، لكن لا توجد نتائج Aiven/Cloudflare حية، ولا تزال قيود بنية الخدمات وsession-level locks قائمة.
