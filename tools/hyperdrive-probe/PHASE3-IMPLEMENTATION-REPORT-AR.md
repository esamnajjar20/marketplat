# تقرير تنفيذ المرحلة الثالثة — MarketPlat Hyperdrive Probe

## ملخص التنفيذ

تمت إضافة عميل benchmark محلي مستقل للمرحلة الثالثة فوق أدوات المرحلة الثانية. يختبر العميل Worker المنشور عبر نقطة الفحص المحمية، ولا يعدّل مسارات التطبيق أو موارد Cloudflare أو قاعدة البيانات.

## الملفات المعدّلة

- `tools/hyperdrive-probe/package.json`
  - إضافة `npm run benchmark:phase3`.
  - إضافة `npm run test:phase3`.
- `tools/hyperdrive-probe/README_AR.md`
  - إضافة دليل تشغيل المرحلة الثالثة.
- `tools/hyperdrive-probe/scripts/connection-snapshot.sql`
  - توسيع لقطة اتصالات PostgreSQL لتشمل العدد الحالي وتوزيع الحالات.

## الملفات الجديدة

- `tools/hyperdrive-probe/scripts/phase3-benchmark.mjs`
  - مستويات التزامن الافتراضية: 1، 5، 10، 25، 50.
  - 60 طلباً لكل مستوى افتراضياً، وبحد أقصى 100.
  - اختبار مستمر لخمس دقائق بحد أقصى 10 طلبات/ثانية و10 طلبات قيد التنفيذ.
  - مهلة 15 ثانية، دون إعادة محاولة.
  - إيقاف التصعيد عند تكرار الأخطاء.
  - إحصاءات p50/p95/p99 ومعدل الطلبات وذروة الطلبات المتزامنة.
  - تقرير JSON محلي تحت `reports/phase3-*.json`.
- `tools/hyperdrive-probe/scripts/phase3-benchmark.test.mjs`
  - اختبارات الإعدادات والحدود والحسابات ومنظم الاختبار المستمر.
- `tools/hyperdrive-probe/PHASE3-LOAD-TEST-AR.md`
  - تعليمات التشغيل، التقاط اتصالات Aiven، قراءة التقرير، وضوابط السلامة.

## نتائج التحقق

- `node --check scripts/phase3-benchmark.mjs`: ناجح.
- `node --check scripts/phase3-benchmark.test.mjs`: ناجح.
- `npm test`: ناجح، 24 اختباراً من أصل 24.
- `package.json`: صالح كـ JSON.

لم ينفذ `npm ci` أو TypeScript type-check ضمن هذه البيئة؛ نسخة Node المتاحة هي 22.16 بينما `package.json` يشترط `>=22.18 <25`، كما أن مجلد `node_modules` غير موجود. لا توجد تغييرات TypeScript في هذه المرحلة.

## النشر والتشغيل

لا يلزم نشر Worker جديد؛ لم يتغير `worker.ts` أو `src/worker-core.ts` أو `wrangler.jsonc`. بعد دمج الملفات، شغّل `npm ci` و`npm run check` على Node متوافق، ثم التقط إحصاءات اتصالات PostgreSQL وشغّل `npm run benchmark:phase3`.

الاختبار الفعلي على حساب Cloudflare/Aiven لم ينفذ من بيئة إعداد الحزمة لعدم توفر رمز Worker وبيانات اتصال Aiven، ويجب تنفيذه من طرفية المستخدم وفق الدليل.
