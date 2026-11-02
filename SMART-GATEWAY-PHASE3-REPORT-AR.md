# MarketPlat Smart Gateway — تقرير المرحلة الثالثة

## ملخص التنفيذ

أُنجزت المرحلة الثالثة الخاصة بتنسيق صحة Backend مركزيًا. أصبح Worker الحالي يستخدم SQLite-backed Durable Object باسم `GatewayHealthCoordinator` لتجميع حالات الأعطال ونتائج الفحص اليدوي ومشاركتها بين Worker isolates، مع الاحتفاظ بقاطع الدائرة المحلي كطبقة حماية سريعة واحتياطية.

لم يتم تفعيل Frontend Load Balancing في هذه المرحلة؛ لا يُعد ذلك نقصًا مخفيًا أو تنفيذًا جزئيًا غير معلن، بل قرار سلامة موثق بسبب بنية OpenNext الحالية وارتباط RSC وServer Actions وملفات Next الثابتة بإصدار البناء. يوجد قسم في التقرير يحدد شروط بدء تلك المرحلة بشكل صحيح.

## ما نُفذ

1. **Durable Object مركزي:** أُضيفت الفئة المصدّرة `GatewayHealthCoordinator` إلى `workers/cf-api-proxy/worker.js`، مع تخزين SQLite وواجهة داخلية للقراءة والتسجيل والمصالحة.
2. **حالة متشاركة بين الـ isolates:** يقرأ كل isolate Snapshot مركزيًا ويخزنه محليًا 5 ثوانٍ. عند تعطل المنسق أو غياب Binding يستمر التوجيه بالـ circuit breaker المحلي.
3. **تسجيل أحداث التشغيل:** تُسجل أخطاء الاتصال و502/503/504 من الطلبات الفعلية، وتسجل نتائج الفحص اليدوي وحالات التعافي. لا تُكتب بيانات المستخدم أو محتوى الطلبات.
4. **Failover عابر للـ isolates:** إذا بلغ Backend حد فشلين متتاليين وفتح قاطع الدائرة، تستطيع نسخة Worker أخرى قراءة الحالة وتجاوز السيرفر نفسه.
5. **إزالة الحالة القديمة:** بعد حفظ Registry جديد، تُزال سجلات الصحة الخاصة بالسيرفرات التي لم تعد ضمن Pool.
6. **لوحة الإدارة:** تعرض حالة الصحة المشتركة، عدد الإخفاقات، وضع Circuit Breaker، آخر HTTP status، آخر زمن فحص، ومصدر الحدث. تعرض بوضوح إن كانت الحالة مركزية أو محلية احتياطية.
7. **لا تشغيل خلفي:** لم يُضف Cron أو Alarm أو فحص دوري. الفحص النشط يظل يدويًا فقط، والأحداث الأخرى تنشأ من الطلبات الفعلية.
8. **قرار Frontend موثق:** لم يُفعّل تدوير Frontend origins؛ يتطلب ذلك Router منفصلًا أو بنية OpenNext Multi-Worker مع Version Affinity وأصول ومفاتيح Server Actions متوافقة.

## الملفات المعدلة

- `workers/cf-api-proxy/worker.js`
- `workers/cf-api-proxy/cache-policy.test.mjs`
- `workers/cf-api-proxy/wrangler.toml`
- `workers/cf-api-proxy/wrangler.example.jsonc`
- `workers/cf-api-proxy/SMART-GATEWAY-IMPLEMENTATION-AR.md`
- `frontend/components/admin/AdminInfrastructureGateway.tsx`

## نتائج التحقق

| الفحص | النتيجة |
|---|---:|
| `npm test` داخل `workers/cf-api-proxy` | ناجح |
| `npm run type-check` داخل `workers/cf-api-proxy` | ناجح |
| سيناريو مشاركة الحالة بين 3 Worker isolates | ناجح |
| تجاوز Backend بعد فتح Circuit Breaker مركزيًا | ناجح |
| حذف سجلات السيرفرات بعد إزالتها من Registry | ناجح |
| التحقق من رفض Health Event غير صالح | ناجح |
| `frontend/scripts/navigation-integrity-audit.mjs` | 26/26 |
| TSX transpile لواجهة Infrastructure | 0 diagnostics |
| تحليل `wrangler.toml` والتحقق من DO Binding/Migration | ناجح |

## حدود التحقق

- لا توجد `node_modules` للواجهة؛ لم يُشغّل `next build` أو `tsc --noEmit` الكامل أو Vitest الخاص بالواجهة.
- لم يتوفر Wrangler CLI في بيئة التنفيذ؛ لم يتم التحقق عبر `wrangler deploy --dry-run`.
- لم يتم نشر Worker أو إنشاء DO namespace على حساب Cloudflare، ولم تُختبر الاستجابة من Render الحقيقي.
- حالة الصحة المركزية تتحدث عند أحداث الطلبات والفحوص اليدوية فقط؛ لا يوجد مراقب دوري.
- Snapshot الصحة يحتفظ به كل isolate لمدة 5 ثوانٍ، لذلك ليس تحديثًا لحظيًا بالميلي ثانية.
- عند تعذر Durable Object، يعود التوجيه تلقائيًا إلى الحالة المحلية، وقد لا تتفق كل isolates مؤقتًا.
- فحص `/health` يثبت Liveness فقط ولا يضمن اتصال PostgreSQL أو Redis.

## إعداد ونشر المرحلة الثالثة

تم تعريف Binding وSQLite migration في `workers/cf-api-proxy/wrangler.toml`. عند النشر القادم استخدم هذا الملف المحدّث من مجلد Worker، ولا تنشر `worker.js` منفردًا:

```bash
cd workers/cf-api-proxy
npx wrangler deploy --dry-run
npx wrangler deploy
```

يجب مراجعة تأكيد Wrangler لتطبيق migration `v1` وإنشاء `GatewayHealthCoordinator`. لا يلزم إعداد Secret إضافي لهذا الـ Durable Object؛ الربط خاص بالـ Worker من خلال `GATEWAY_HEALTH` Binding. احتفظ بسر `GATEWAY_ADMIN_TOKEN` الحالي كما هو.

## التكلفة

وثائق Cloudflare بتاريخ 18 أكتوبر 2026 تذكر توافر Durable Objects على Workers Free وPaid، مع 100,000 طلب و13,000 GB-s يوميًا ضمن حصة Free. تجاوز أي حصة مجانية يوقف عمليات ذلك البند حتى إعادة التعيين اليومية؛ راقب استخدام DO بعد النشر. المصدر: https://developers.cloudflare.com/durable-objects/platform/pricing/

## لماذا لم يُفعّل Frontend Load Balancing؟

الواجهة الحالية مبنية بـ Next.js 15.5.27 وتُنشر عبر OpenNext على Worker واحد. تدوير الطلبات بين أصول Frontend مستقلة دون Version Affinity قد يخلط إصدارات RSC أو Server Actions أو ملفات `_next/static`. وثائق OpenNext تصف إعداد Multi-Worker بأنه متقدم، وتذكر أنه لا يدعم Preview URLs أو Skew Protection أو أمر النشر القياسي. لذلك لا يجوز تفعيل Frontend Pool قبل بناء خطة نشر متزامنة ومشاركة الأصول والمفاتيح والـ Build ID. المصدر: https://opennext.js.org/cloudflare/howtos/multi-worker

## القرار التالي

الخطوة التالية الآمنة هي إعداد Frontend version affinity وخطة نشر أزرق/أخضر للـ OpenNext Worker، ثم يمكن بناء Frontend Router. بالتوازي، يجب نشر واختبار Durable Object على Staging أولًا قبل اعتماده للإنتاج.
