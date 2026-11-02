# MarketPlat Smart Cache & Gateway — دليل التنفيذ

> **الحالة الحالية — بعد تحويل Worker إلى TypeScript:** ملف الدخول المعتمد هو `worker.ts`، ويشير إليه `wrangler.toml` و`wrangler.example.jsonc`. أزيل ملف `worker.js` القديم حتى لا يُنشر إصدار JavaScript سابق بالخطأ. الأقسام اللاحقة تحتفظ بتسلسل تاريخ المراحل، وقد تصف بعض تفاصيل المرحلة الأولى قبل أن تستبدلها التحديثات اللاحقة الواردة في هذا الدليل.

## المصدر الحالي وطبقة الأنواع

- `worker.ts` هو مصدر Cloudflare Worker الوحيد، و`src/types.ts` يحتوي عقود البيئة والـ Registry ومجموعات Backend/Frontend والصحة والكاش وواجهات KV وDurable Objects.
- التكوين يستخدم `strict`, و`noImplicitAny`, و`noUncheckedIndexedAccess`, و`noUnusedLocals`, و`noUnusedParameters`, و`exactOptionalPropertyTypes`, و`useUnknownInCatchVariables`، إضافة إلى `isolatedModules` و`noEmitOnError`.
- بيانات JSON القادمة من KV أو طلبات HTTP أو Durable Object تدخل كـ `unknown`، ثم تمر عبر Type Guards والتحقق التشغيلي قبل استخدامها. أنواع Backend وFrontend اتحاد مميّز `healthKind`، بحيث يكون `buildId` إلزاميًا للواجهة ولا يمكن تمريره لسيرفر Backend بالخطأ.
- `npm run build` يولّد `dist/worker.js` للاختبار المحلي فقط؛ مجلد `dist` غير مصدر ولا يُنشر مباشرة. Wrangler يبني من `worker.ts` وفق `main` في ملف الإعداد.
- أوامر الفحص من جذر المشروع: `pnpm --filter @marketplat/cf-api-proxy type-check` ثم `pnpm --filter @marketplat/cf-api-proxy test`.
- Durable Object هو سلطة الكتابة الذرية لسجل Registry وحالة الصحة عند توفر Binding؛ KV يحتفظ بنسخة قراءة احتياطية/توافقية، وليس قفل التزامن.
- التسخين التلقائي ما زال معطلًا: لا Cron ولا Alarm ولا فحص دوري خلفي. فحص الصحة يدوي أو ينتج عن طلبات المرور الفعلية.


## ما الذي تغيّر؟

تم توسيع `worker.ts` الحالي بدل إنشاء Worker موازٍ. حافظت المرحلة على طبقة الكاش الحالية (Cache API وKV المرجعي وSWR وETag/304 وCache Tags وSingle-flight)، وأضافت مجموعة Backend ديناميكية.

### المزايا المنفذة

- سجل Backend/Frontend مركزي محفوظ في Durable Object تحت مفتاح `gateway:registry:v1`؛ ويحتفظ `REFERENCE_KV` بنسخة قراءة احتياطية/توافقية.
- لا يتأثر سجل التوجيه بمسار `/__purge__`؛ عملية التطهير تحذف مفاتيح `ref:v1:*` فقط.
- استراتيجية `weighted-random` بأوزان من 1 إلى 1000، مع اختيار موزون لكل طلب يحتاج الوصول إلى الأصل.
- عند غياب سجل Registry أو تعذّر DO وKV معًا، يستمر Backend fallback باستخدام `RENDER_ORIGIN` الحالي.
- Failover تلقائي لطلبات `GET` و`HEAD` عند فشل الاتصال أو استجابات `502/503/504`، ويجمع زمن محاولات الأصل في `x-upstream-ms`.
- Circuit breaker يجمع الحالة عبر Durable Object عند توافره، مع مرآة محلية سريعة واحتياطية لكل isolate. يسجل فشل الاتصال أو `502/503/504` ويفتح الدائرة بعد فشلين متتاليين لمدة 30 ثانية، ثم يسمح بمحاولة Half-open.
- طلبات `POST/PUT/PATCH/DELETE` لا يعاد إرسالها تلقائيًا؛ قد يكون الخادم الأول نفّذ العملية قبل انقطاع الاتصال، وإعادتها قد تكرر إعلانًا أو طلب شراء أو رسالة.
- ترويسات تشخيصية: `x-mp-backend-id` و`x-mp-route-attempts` و`x-mp-route-mode`.
- تدفق SSE للإشعارات يبقى Streaming ولا يخزن في الكاش.
- إضافة واجهة إدارية Server-to-Server محمية بسر `GATEWAY_ADMIN_TOKEN` عبر `GET/PUT/POST /__gateway/registry`؛ POST مخصص لفحص الصحة اليدوي.
- عزل مفتاح إعدادات التوجيه عن بادئة الكاش المرجعي، مع التحقق من HTTPS ومنع عناوين IP الحرفية والمضيفات المحلية. يمكن تقييد النطاقات أكثر بواسطة `GATEWAY_ALLOWED_HOSTS`.


## المرحلة الثانية (تاريخية) — لوحة إدارة البنية التحتية وفحص الصحة اليدوي

أضيفت لوحة الإدارة داخل `/admin?tab=infrastructure` باسم **إدارة البنية التحتية**، وتسمح لـ `ADMIN` و`SUPER_ADMIN` فقط بإدارة مجموعة Backend:

- إضافة أصل HTTPS جديد مع معرّف ووزن.
- تعديل الأوزان، تفعيل السيرفر أو تعطيله، وإزالته.
- عرض مجموع الأوزان وحصة التوجيه الإحصائية التقريبية لكل سيرفر.
- قراءة نسخة السجل ومصدره ووقت آخر تعديل.
- منع الكتابة فوق تعديل أحدث من جلسة أخرى عند اكتشاف اختلاف رقم النسخة، وإظهار رسالة تطلب إعادة التحميل بدل الكتابة بصمت. كان هذا فحصًا تفاؤليًا مبنيًا على KV في المرحلة الثانية؛ استبدلته المرحلة الرابعة بحفظ ذري عبر Durable Object مع إبقاء KV نسخة احتياطية.
- تنفيذ فحص صحة يدوي لكل سيرفر مفعّل عبر `GET /health` بمهلة 4 ثوانٍ.
- عرض نتيجة الفحص وزمن الاستجابة، مع توضيح أن نتيجة الفحص تخص موقع Worker المنفّذ فقط.

أضيفت واجهة Next.js داخل `frontend/app/api/admin/gateway/registry/route.ts`. وهي لا تكشف `GATEWAY_ADMIN_TOKEN` للمتصفح: تتحقق أولًا من جلسة المستخدم عبر `GET /api/v1/users/me` باستخدام Service Binding `API_WORKER`، وتسمح فقط بدوري `ADMIN` و`SUPER_ADMIN`، ثم تمرر الطلب إلى Worker مع الرمز من جهة الخادم. عمليات PUT وPOST تتطلب `Origin` مطابقًا لنطاق الواجهة ورفضًا افتراضيًا عند غيابه. يمرّر المتصفح رمز الوصول الحالي إلى مسار Next.js من جهة العميل، ثم لا يمرّر المسار إلى Worker إلا سر البوابة؛ لا يظهر السر في المتصفح أو الاستجابة.

أُضيف المسار إلى قائمة الإدارة، ونموذج تبويبات الإدارة، وRedirects القديمة، و`ROUTES.admin`. لا يستطيع `MODERATOR` فتح القسم.

### الأسرار المطلوبة بعد المرحلة الثانية

يجب ضبط **القيمة نفسها** كسر في Worker الواجهة وWorker الـ API؛ لا تضعها في أي متغير يبدأ بـ `NEXT_PUBLIC`:

```bash
# داخل workers/cf-api-proxy — Worker الخاص بالـ API
npx wrangler secret put GATEWAY_ADMIN_TOKEN

# داخل frontend — Worker الخاص بواجهة Next.js
npx wrangler secret put GATEWAY_ADMIN_TOKEN
```

أدخل القيمة السرية نفسها في الموضعين. وفي التطوير المحلي فقط، ضعها في `frontend/.env.local` تحت `GATEWAY_ADMIN_TOKEN`، دون إضافتها إلى Git. يبقى `API_WORKER` Service Binding الموجود في `frontend/wrangler.jsonc` مطلوبًا لتجنب استدعاء Worker آخر عبر `workers.dev`.

### حدود الفحص اليدوي كما كانت في المرحلة الثانية (تاريخيًا)

- لا يوجد Cron أو فحص صحي دوري، ولا تم تفعيل Warmup.
- `GET /health` هو Liveness Check خفيف يؤكد أن عملية API تستجيب؛ لا يضمن سلامة PostgreSQL أو Redis. فحص الجاهزية العميق `/ready` لم يُعتمد عمدًا هنا حتى لا يؤدي فحص البوابة إلى حمل DB إضافي.
- الفحص لا يثبت صحة السيرفر عالميًا؛ ينفذ من موقع Cloudflare الذي تعامل مع طلب الإدارة.
- قاطع الدائرة ما زال محليًا لكل Worker isolate. الفحص اليدوي يسجل نجاح/فشل السيرفر في الـ isolate الذي نفذ الفحص فقط.
- لا يوجد بعد توجيه Frontend Pool؛ هذه المرحلة تخص Backend API.

## إعداد Cloudflare — إعدادات المرحلة الأولى (مع مراعاة تحديثات المراحل اللاحقة)

1. أبقِ Binding `REFERENCE_KV` الموجود كما هو؛ لا تنشئ Namespace آخر لهذه المرحلة.
2. أضف سرًا مستقلًا، ولا تستخدم `PURGE_TOKEN` بدلًا منه:

```bash
npx wrangler secret put GATEWAY_ADMIN_TOKEN
```

3. يوصى بإضافة قائمة لاحقات النطاقات المسموح بها كمتغير Worker `GATEWAY_ALLOWED_HOSTS`، مثل:

```text
onrender.com,example.net
```

هذه القائمة اختيارية في الكود، لكن تقييدها في الإنتاج أفضل أمنيًا. لا تضع سر الإدارة في تطبيق الويب أو الموبايل.
4. انشر Worker من مجلد `workers/cf-api-proxy` بعد مراجعة القيم والـ secrets.

## صيغة سجل Backend

```json
{
  "backend": {
    "strategy": "weighted-random",
    "servers": [
      {
        "id": "render-primary",
        "url": "https://marketplat-nz19.onrender.com",
        "weight": 70,
        "enabled": true
      },
      {
        "id": "render-secondary",
        "url": "https://api-secondary.example.net",
        "weight": 30,
        "enabled": true
      }
    ]
  }
}
```

كل الخوادم في المجموعة يجب أن تقدم API متوافقًا، وأن تستخدم قاعدة البيانات المشتركة نفسها وإصدارات متوافقة من مخطط Prisma. لا تضف نسخة Backend مستقلة بقاعدة بيانات منفصلة إلى هذا الـ pool.

## إدارة السجل

قراءة الإعدادات والحالة المحلية:

```bash
curl https://marketplat-api.esamnajjar6.workers.dev/__gateway/registry \
  -H "x-gateway-admin-token: $GATEWAY_ADMIN_TOKEN"
```

تحديث السجل (يمكن إضافة `"version": 1` إلى جسم الطلب لرفض التعديل إذا تغيّرت النسخة بعد تحميلها؛ عند التعارض يعيد Worker الحالة `409 REGISTRY_VERSION_CONFLICT`):

```bash
curl -X PUT https://marketplat-api.esamnajjar6.workers.dev/__gateway/registry \
  -H "x-gateway-admin-token: $GATEWAY_ADMIN_TOKEN" \
  -H "content-type: application/json" \
  --data-binary @gateway-registry.json
```

تستطيع الآن إدارة المجموعة من لوحة `/admin?tab=infrastructure`. تبقى أوامر curl أدناه خيارًا تشغيليًا مباشرًا للمشغل؛ لا ترسل `GATEWAY_ADMIN_TOKEN` إلى المتصفح.

## السلوك والحدود الحالية

- الطلبات التي تُخدم من Edge Cache لا تحتاج إلى اختيار Backend؛ التوزيع ينطبق على Cache MISS وإعادة التحقق والطلبات التي تتجاوز الكاش.
- Durable Object هو المرجع الأساسي لسجل Registry عند توافر Binding، ويستخدم معاملات SQLite للتحقق الذري من `expectedVersion` وحفظ النسخة الجديدة. KV نسخة قراءة احتياطية/توافقية، وليست قفل تزامن.
- حالة الصحة مشتركة مركزيًا عبر Durable Object مع ذاكرة محلية قصيرة لتقليل الطلبات. عند تعذر DO يستمر التوجيه باستخدام الحالة المحلية؛ لا يوجد فحص صحي دوري أو Cron.
- `GET/HEAD` فقط يعاد توجيههما تلقائيًا إلى أصل بديل عند فشل مؤقت. لا يعاد تشغيل POST/PUT/PATCH/DELETE أو Server Actions لتجنب تكرار العمليات.
- يدعم السجل مجموعتي Backend وFrontend منفصلتين. توجيه Frontend مشروط بتطابق `buildId` وبنشر artifact Next.js نفسه ومشاركة مفاتيح Server Actions وأسرار الجلسات والتهيئة اللازمة.
- أي مزود استضافة مقبول عندما يقدم أصل HTTPS عامًا ومتوافقًا مع عقود MarketPlat؛ `provider` و`region` معلومات وصفية ولا يفرضان مزودًا بعينه.
- حد أمني باقٍ: فحص hostname وHTTPS وقائمة `GATEWAY_ALLOWED_HOSTS` لا يثبت عنوان DNS ولا يمنع DNS rebinding بشكل كامل؛ استخدم قائمة سماح ضيقة لأصول تملكها أو تثق بها.
- لم يتم نشر هذه النسخة إلى حساب Cloudflare الإنتاجي. يلزم تطبيق migration والتحقق من DNS/Routes/Secrets واختبار الأصول الحقيقية قبل نقل حركة المرور.

## إبقاء التسخين معطلًا

أزيل Cron التسخين من `wrangler.toml` و`wrangler.example.jsonc`، وأزيل Handler المجدول ودالة التسخين. يعيد `/__warm__` الآن `404` ولا يرسل طلبات إلى Render. لا تعِد إضافة Cron لهذا الـ Worker ما دام قرار المشروع هو إبقاء التسخين معطلًا.

## الاختبارات

من هذا المجلد:

```bash
npm test
npm run type-check
```

تشمل اختبارات Worker: المحافظة على سياسة الكاش، سجل KV، إضافة وتحديث Registry، رفض نسخة سجل قديمة، التحقق من روابط الخوادم، Weighted failover، Circuit Breaker، عدم إعادة طلبات POST، حماية الإدارة، الفحص الصحي اليدوي، بقاء سجل التوجيه بعد purge، وبقاء التسخين معطلًا. أضيفت اختبارات واجهة لمسار الإدارة للتحقق من دور المستخدم وCSRF وعدم تسريب سر البوابة؛ فحوص TypeScript للواجهة واختبارات Vitest تحتاج تثبيت اعتمادات الواجهة وتشغيلها في بيئة المشروع.


## المرحلة الثالثة — تنسيق مركزي لحالة الصحة (Central Health Coordination)

تمت إضافة `GatewayHealthCoordinator` كـ SQLite-backed Durable Object باسم `GATEWAY_HEALTH`:

- يخزن حالات Backend التشغيلية فقط: عدد الإخفاقات المتتالية، وقت فتح Circuit Breaker، آخر HTTP status، زمن الفحص، وقت التحديث ومصدر الحدث.
- يتلقى أحداث الإخفاق والتعافي من الطلبات الفعلية، ونتائج الفحص اليدوي. لا يسجل بيانات مستخدمين أو أجسام طلبات.
- يحذف سجلات السيرفرات التي أزيلت من Registry عبر عملية reconcile بعد حفظ المجموعة.
- تقرأ كل نسخة Worker لقطة الحالة المشتركة، وتخزنها محليًا لمدة 5 ثوانٍ لتقليل استدعاءات Durable Object. بالتالي قد تتأخر رؤية حادثة جديدة في نسخة أخرى حتى انتهاء هذه المدة، مع بقاء قاطع الدائرة المحلي فعالًا.
- إذا تعذر الوصول إلى Durable Object يستمر التوجيه باستخدام الحالة المحلية بدل تعطيل طلبات المستخدمين.
- لا يوجد Cron أو Alarm أو فحص صحي في الخلفية. يبقى Active Probe يدويًا فقط، وتأتي الأحداث الأخرى من طلبات المستخدم الفعلية.

### إعداد Durable Object

أضيف إلى `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "GATEWAY_HEALTH"
class_name = "GatewayHealthCoordinator"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["GatewayHealthCoordinator"]
```

يجب نشر Worker باستخدام `wrangler.toml` المحدّث حتى تُطبّق migration `v1` وتُنشأ مساحة SQLite. لا يكفي رفع ملف المصدر وحده؛ انشر المشروع عبر Wrangler لتطبيق migration `v1`. لا توجد حاجة إلى إضافة secret جديد لهذه المرحلة؛ الوصول إلى الـ Durable Object يتم عبر Binding داخلي في Worker.

### Frontend Routing — تحديث المرحلة الرابعة

أُضيفت مجموعة Frontend مستقلة عن Backend في سجل Durable Object المركزي، مع وزن وتفعيل ومزوّد ومنطقة ومسار صحة ومسار إصدار لكل أصل. يوجه Worker الطلبات فقط عندما يطابق المضيف `FRONTEND_GATEWAY_HOSTS` مطابقة تامة. يثبت Cookie آمن اختيار الأصل للزائر، بما يشمل وثائق HTML وطلبات RSC وملفات `/_next/static` وطلبات Server Actions. GET وHEAD فقط يمكن تحويلهما إلى أصل بديل عند فشل مؤقت؛ لا يعاد إرسال POST/Server Actions تلقائيًا.

**حماية توافق Next.js:** يجب أن تتطابق `buildId` لكل الأصول النشطة. ويلزم نشر artifact واحد على جميع الأصول مع نفس `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` وأسرار المصادقة/الجلسات والتهيئة ذات الصلة؛ تساوي Build ID وحده لا يثبت تطابق هذه الأسرار. أنشأ `build:cf` الآن `public/build-id.json` قبل `next build` حتى يستطيع فحص الإصدار التحقق منه.

يُضبط `FRONTEND_GATEWAY_HOSTS` مرة واحدة في Worker Variables، وتُربط كل `hostname/*` Cloudflare Route بهذا Worker. لا يتم إنشاء DNS أو Routes تلقائيًا من لوحة الإدارة. يجب أن يختلف كل Frontend origin عن النطاق العام نفسه، ويُرفض التطابق لتجنب حلقة الوكيل. يظل مسار الصحة الافتراضي للواجهة `/build-id.json` (يمكن تخصيصه إلى مسار readiness خفيف).

توثيق Next.js يوصي بوجود reverse proxy أمام خادم Next.js، كما تعتمد حماية Server Actions على توافق Origin مع Host أو `X-Forwarded-Host`؛ لذلك يحافظ الوكيل على Origin ويعيد ضبط `X-Forwarded-Host` إلى المضيف العام الموثوق بدل تمرير قيمة يرسلها العميل. وتوثيق OpenNext يذكر دعم App Router وRSC وServer Actions وstreaming، لكن هذا لا يلغي شرط توحيد الإصدار والأسرار عبر الأصول.

### فحوص المرحلة الثالثة

- `npm test` داخل `workers/cf-api-proxy`: ناجح، ويشمل سيناريو ثلاث نسخ Worker مستقلة تتشارك حالة الصحة عبر Durable Object، ثم تتجاوز Backend الذي وصل إلى Circuit Open.
- `npm run type-check` داخل Worker: ناجح (فحوص Node syntax المعرّفة في package scripts).
- `node frontend/scripts/navigation-integrity-audit.mjs`: 26/26 ناجحة.
- TypeScript TSX transpile للوحة الإدارة: صفر diagnostics نحوية.
- `wrangler.toml`: تم تحليله بنجاح والتحقق من Binding وSQLite migration.
- لم يُشغّل `next build` أو `tsc --noEmit` الكامل؛ اعتماديات الواجهة غير مثبتة في الحزمة.
- لم يُنفذ نشر Cloudflare أو اختبار على حساب الإنتاج؛ يلزم تطبيق migration ومراجعة استعمال Durable Objects بعد النشر.

### التكلفة والحصص

تتوفر Durable Objects على Workers Free وPaid، لكن الخطة المجانية تضع حدودًا يومية للطلبات والمدة؛ وفق جدول Cloudflare المنشور في 18 أكتوبر 2026، الحد المجاني هو 100,000 طلب يوميًا و13,000 GB-s يوميًا، وتتوقف العمليات التي تتجاوز أي حصة مجانية حتى إعادة ضبطها. لذلك أضيفت ذاكرة محلية 5 ثوانٍ ولا توجد قراءة DO لكل طلب. راقب الاستهلاك بعد النشر: https://developers.cloudflare.com/durable-objects/platform/pricing/

## استكمال المرحلة الرابعة — مزود محايد وأولوية ومهلة لكل أصل

تم الآن إكمال حقول التوجيه التشغيلية للمجموعتين Backend وFrontend، وليس فقط إضافة الأصول:

- `priority` من 1 إلى 1000 (الافتراضي 100): المستوى الأقل رقمًا يُجرب أولًا. عند وجود عدة أصول في مستوى الأولوية نفسه، يوزع `weighted-random` الطلبات حسب `weight`.
- `timeoutMs` من 1000 إلى 30000 ملي ثانية (الافتراضي 20000): يطبق على طلب الأصل الحالي. لا يُستخدم timeout موحد لكل المجموعة.
- `provider` و`region` حقول وصفية فقط. قبول الأصل لا يعتمد على اسم الشركة أو مزود الاستضافة، بل على HTTPS وتوافق الخدمة. لا يوجد حاليًا توجيه جغرافي حسب Region ولا فحص latency بين المناطق.
- لوحة الإدارة تحسب حصة الوزن داخل مستوى الأولوية نفسه؛ لذلك لا تعرض نسبة مجموعية مضللة بين مستويات مختلفة.
- تمت إضافة التحقق من نطاقات priority وtimeout في واجهة الإدارة وسجل Worker، مع اختبارات للحدود والقيم الافتراضية وترتيب الأولوية.

### ملاحظات نشر وحدود أمنية

أي مزوّد Hosting مقبول من الناحية التقنية إذا أعطى أصل HTTPS عامًا ومتوافقًا. Backend يجب أن يشارك عقد API ومخطط البيانات والجلسات وأسرار المصادقة مع بقية نسخ MarketPlat. Frontend يجب أن ينشر Artifact Next.js نفسه وBuild ID ومفاتيح Server Actions وأسرار الجلسات نفسها. لا يمكن اعتبار خدمة HTTPS عشوائية متوافقة لمجرد أن اتصالها ينجح.

يُفضل إعداد `GATEWAY_ALLOWED_HOSTS` بقائمة نطاقات ضيقة. التحقق البرمجي يمنع IP literals والمضيفات المحلية الشائعة ويتطلب HTTPS، لكنه لا يثبت عنوان DNS ولا يضمن مقاومة DNS rebinding بشكل كامل. كما أن `provider` و`region` لا يغيران مسار الاختيار الحالي.

تم تحديث لوحة الإدارة كي تعرض priority وtimeout لكل أصل، وتعيد حساب نسبة الوزن داخل الأولوية نفسها. افتراضي مهلة الطلب 20 ثانية، ومدى التخصيص من ثانية إلى 30 ثانية.

راجع التقرير التفصيلي في `SMART-GATEWAY-PHASE4-REPORT-AR.md` لقائمة الملفات، نتائج الاختبارات، حدود التحقق، ومتطلبات تفعيل الإنتاج.
