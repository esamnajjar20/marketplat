# منظومة اختبار الضغط الموحدة — MarketPlat

هذه المنظومة توحّد اختبارات التحميل على واجهات MarketPlat عبر **k6**. لا تحتاج إلى إنشاء ملف اختبار جديد لكل Endpoint؛ تُستخرج العمليات آليًا من Express وGo Worker وNext.js Route Handlers، وتُضاف عمليات Worker التي تتوزع تعريفاتها في ملفات مختلفة إلى الجرد، بينما تبقى أوزان الحمل والـ payloads والـ IDs والـ thresholds قابلة للتعديل من ملف إعداد واحد.

## ما الذي يدخل ضمن الجرد؟

- الجرد الحالي يحتوي **455 عملية HTTP** موزعة على 12 مجموعة: `classifieds`, `commerce`, `discovery`, `engagement`, `frontend-api`, `identity`, `platform`, `services`, `trust`, `go-worker`, `edge-ops`, `keepalive-worker`.
- يشمل مسارات Express API ومسارات الصحة والتشغيل وواجهات OpenAPI/Swagger التطويرية و`POST /batch`، و**43 مسارًا** من Go Worker، و**7 عمليات** من Cloudflare API Worker control plane (Gateway Registry وFeature Flags وCache Purge)، و**11 عملية** من Next.js Route Handlers، ونقطتي توثيق للتطوير (`/api/docs` و`/api/docs.json`)، ونقطة HTTP واحدة من Keepalive Worker.
- تُستخرج طريقة HTTP والمسار ومصدر Route والمجموعة ووجود المصادقة والدور والمسارات ذات المعاملات مثل `:id`.
- عند إضافة Route جديد إلى ملفات `*.routes.ts` أو Go Worker أو `frontend/app/api/**/route.ts`، يعيد الـ Workflow توليد الجرد من المصدر قبل التشغيل. عمليات Cloudflare control plane معرفة بجانب مولّد الجرد لأن طرقها موزعة بين handlers داخل `worker.ts`.

الجرد يشمل واجهات HTTP المعلنة في Express وGo Worker وNext.js وواجهات التحكم في Cloudflare Worker وKeepalive Worker. لا يُكرر `/api/v1/[...path]` في Next.js لأنه Proxy لنفس عمليات Express الموجودة في الجرد. ولا يحاكي كل شاشة Frontend أو المهام المجدولة غير HTTP (بما فيها outbound scheduled probes للـ Keepalive) أو كل دالة قاعدة بيانات؛ هذه تحتاج سيناريوهات منفصلة إذا كانت مطلوبة.

## الملفات الأساسية

| الملف | الغرض |
|---|---|
| `catalog/generate-route-inventory.mjs` | اكتشاف Express وGo Worker وNext.js Route Handlers وتوليد الجرد، مع تعريف مسارات Edge وKeepalive Worker |
| `catalog/route-inventory.js` | القائمة المولدة؛ لا تعدّلها يدويًا |
| `catalog/verify-workload.mjs` | فحص تطابق الإعدادات مع الجرد |
| `config/workload.config.js` | ملف التعديل الأساسي: المجموعات والأوزان والـ query والـ IDs والـ payloads والـ thresholds |
| `unified.js` | محرك k6: اختيار العمليات، إرسال الطلبات، القياسات، وتصنيف الأخطاء |
| `reports/` | مخرجات التشغيل المحلية |
| `.github/workflows/load-test-unified.yml` | Workflow موحد قابل للتشغيل يدويًا من GitHub Actions |

## التشغيل محليًا

يتطلب Node.js المتوافق مع إصدار المشروع وk6 مثبتًا على الجهاز:

```bash
npm run loadtest:inventory
npm run loadtest:verify
mkdir -p apps/api/load-tests/reports
set -o pipefail
TARGET=http://localhost:5000 \
PROFILE=smoke \
PEAK_VUS=5 \
DURATION_SECONDS=30 \
RAMP_SECONDS=5 \
npm run loadtest:run 2>&1 | tee apps/api/load-tests/reports/k6-console.log
sed -n 's/^.*\[LOAD_TEST_ERROR\] //p' apps/api/load-tests/reports/k6-console.log | jq -s '.' > apps/api/load-tests/reports/error-samples.json
```

للتشغيل على أي هدف بعيد (API أو Frontend أو Go Worker أو Keepalive)، يجب تحديد `CONFIRM_NON_PRODUCTION=true` بعد التأكد بنفسك أن كل هدف بيئة اختبار مخصصة وليست بيئة إنتاج. العناوين المعروفة للإنتاج محظورة داخل المحرك والـ Workflow. لا تضع بيانات اعتماد داخل عنوان URL.

## تشغيل GitHub Actions

من تبويب **Actions** اختر **Load Test — Unified API Operations** ثم **Run workflow**. هذا الـ Workflow يدوي فقط ولا يطلق حملًا تلقائيًا عند كل Push.

المدخلات القابلة للتعديل:

- `target`: أصل الخادم، مثل `https://staging.example.test` أو `https://staging.example.test/api/v1`.
- `profile`: `smoke`, `standard`, `stress`, `spike`, أو `soak`.
- `load_model`: `vus` لمحاكاة مستخدمين متزامنين، أو `arrival-rate` لاستهداف معدل طلبات في الثانية.
- `peak_vus`, `pre_allocated_vus`, `max_vus`, `duration_seconds`, `ramp_seconds`, `request_rate`.
- `selection_strategy`: `round-robin` لتوزيع الطلبات بالتناوب على العمليات المؤهلة، أو `weighted` لتطبيق أوزان المجموعات والعمليات.
- `operation_groups`: `all` أو قائمة مفصولة بفواصل من أسماء المجموعات، بما فيها `go-worker` و`edge-ops` و`frontend-api` و`keepalive-worker`.
- `include_mutations`, `include_admin`, `include_internal`: مفاتيح تعطيل افتراضية للكتابة وعمليات الإدارة ومسارات Worker الداخلية.
- حدود `p95`, `p99`, ومعدل الأخطاء.

`smoke` فحص أولي خفيف، و`standard` تدرّج إلى الحمل المحدد، و`stress` يطيل فترة الحمل الأعلى، و`spike` يقفز سريعًا إلى الحمل، و`soak` يحافظ على الحمل لفترة ثابتة. عند استخدام `arrival-rate` تُطبّق ملفات الحمل المقابلة على معدل الطلبات.

## إعداد أسرار الاختبار والبيانات

أضف القيم التالية في GitHub Actions Secrets / Variables عند الحاجة. القيم لا تُكتب داخل ملفات المستودع.

| الاسم | المكان | الاستخدام |
|---|---|---|
| `LOAD_TEST_USER_TOKEN` | Secret | Bearer token لمستخدم اختبار |
| `LOAD_TEST_BEARER_TOKEN` | Secret | اسم بديل عام لتوكن المستخدم |
| `LOAD_TEST_MODERATOR_TOKEN` | Secret | توكن مشرف؛ يستخدم توكن Admin بديلًا عند غيابه |
| `LOAD_TEST_ADMIN_TOKEN` | Secret | توكن مدير |
| `LOAD_TEST_GO_WORKER_TOKEN` | Secret | Bearer token لبوابة Go Worker `/__go`؛ يجب أن يطابق سر `GO_WORKER_TOKEN` في إعداد Worker |
| `LOAD_TEST_GO_WORKER_TARGET` | Variable اختياري | أصل Go Worker مباشر لاختبار المسارات خارج `/internal` مثل `/healthz`، أو لتجاوز بوابة Cloudflare |
| `LOAD_TEST_FRONTEND_TARGET` | Variable اختياري | أصل Next.js Frontend / Worker لاختبار `frontend-api`؛ يجب أن يكون أصلًا مستقلًا مخصصًا للاختبار |
| `LOAD_TEST_KEEPALIVE_TARGET` | Variable اختياري | أصل Keepalive Worker لاختبار `GET /` |
| `LOAD_TEST_FRONTEND_ADMIN_COOKIE` | Secret اختياري | Cookie جلسة مدير الاختبار لمساري تفعيل/تعطيل Debug Console |
| `LOAD_TEST_CACHE_REVALIDATION_SECRET` | Secret اختياري | سر HMAC لا يقل عن 32 محرفًا لمسار Next.js Cache Revalidation؛ يولّد المحرك timestamp وSHA-256 signature لكل طلب || `LOAD_TEST_EDGE_GATEWAY_ADMIN_TOKEN` | Secret | `x-gateway-admin-token` لواجهات سجل التوجيه |
| `LOAD_TEST_EDGE_FEATURE_FLAGS_TOKEN` | Secret | `x-feature-flags-token` لواجهة Feature Flags الإدارية |
| `LOAD_TEST_EDGE_PURGE_TOKEN` | Secret | `x-purge-token` لمسار مسح الكاش، لا تفعّله إلا في بيئة اختبار معزولة |
| `LOAD_TEST_EDGE_FEATURE_FLAGS_ACTOR` | Variable | `x-feature-flags-actor`؛ قيمة تدقيق مثل `load-test` عند اختبار تحديث Feature Flags |
| `LOAD_TEST_ROUTE_PARAMS_JSON` | Secret | JSON لقيم معاملات المسارات العامة عند الحاجة |
| `LOAD_TEST_GLOBAL_HEADERS_JSON` | Secret | JSON لرؤوس Worker / Health / Internal المشتركة |
| `LOAD_TEST_AD_ID` | Variable | معرّف إعلان اختبار حقيقي |
| `LOAD_TEST_PRODUCT_ID` | Variable | معرّف منتج اختبار حقيقي |
| `LOAD_TEST_STORE_ID` | Variable | معرّف متجر اختبار حقيقي |
| `LOAD_TEST_SERVICE_LISTING_ID` | Variable | معرّف خدمة اختبار حقيقي |
| `LOAD_TEST_LAT` و`LOAD_TEST_LNG` | Variables | إحداثيات بيانات الاختبار لعملية البحث القريب |

مثال قيمة `LOAD_TEST_GLOBAL_HEADERS_JSON`:

```json
{
  "x-worker-secret": "<secret-value>",
  "x-health-token": "<health-token>"
}
```

مثال قيمة `LOAD_TEST_ROUTE_PARAMS_JSON`:

```json
{
  "id": "<real-test-id>"
}
```

تُستخدم قيم `params` الموجودة على مستوى العملية في `workload.config.js` أولًا، ثم القيم المشتركة كحل احتياطي. لا تضع قيمة `id` عامة إذا كانت المسارات المحددة تتطلب أنواع موارد مختلفة؛ فضّل وضع المعرف في `params` للعملية نفسها.

التوكنات يجب أن تخص حسابات اختبار ذات الأدوار المناسبة. لا تستخدم توكن مستخدم حقيقي أو بيانات إنتاج.

## تعديل عبء الاختبار

حرّر `config/workload.config.js` فقط لمعظم التعديلات:

```js
operations: {
  'GET /ads': {
    enabled: true,
    weight: 10,
    query: { page: 1, limit: 20, sort: 'latest' },
  },
  'GET /ads/:id': {
    enabled: true,
    params: { id: '$env:LOAD_TEST_AD_ID' },
    weight: 2,
  },
},
```

يمكنك تعطيل مجموعة كاملة عبر `groups.<group>.enabled = false`، أو تغيير وزنها. الأوزان نسبية وليست نسبًا مئوية.

### قواعد الاختيار الآمن

1. عمليات القراءة العامة المؤهلة تعمل افتراضيًا.
2. القراءة المحمية لا تعمل إلا بوجود Bearer token مناسب.
3. أي Route يحتوي `:id` أو أي معامل مسار آخر يُسجّل ضمن الجرد، لكنه يُتخطى حتى توفر قيمة حقيقية.
4. عمليات `POST/PUT/PATCH/DELETE` لا تعمل افتراضيًا. لتجربتها يجب تفعيل العملية نفسها في `workload.config.js` ثم تحديد `include_mutations=true` في تشغيل الـ Workflow.
5. العمليات الداخلية وGo Worker وEdge control plane وواجهات Next.js وKeepalive Worker لا تعمل افتراضيًا حتى لو كانت قراءة؛ يلزم تفعيل العملية نفسها ثم `include_internal=true`. عمليات الإدارة في Express وNext.js تحتاج كذلك `include_admin=true` وتوكن الدور.
6. Go Worker يمر افتراضيًا عبر Cloudflare Gateway بمسار `/__go/internal/...` ويتطلب `LOAD_TEST_GO_WORKER_TOKEN`. يمكن تعيين `LOAD_TEST_GO_WORKER_TARGET` كأصل مباشر لاختبار Go Worker دون الـ Gateway؛ هذا العنوان يجب أن يكون بيئة اختبار أيضًا. المسار `/healthz` لا يمر عبر `/__go` لأن توجيه Gateway مقيّد بالمسارات الداخلية، لذلك لا يدخل الاختبار إلا عند ضبط العنوان المباشر.
7. واجهات Next.js مستقلة عن API target وتحتاج `LOAD_TEST_FRONTEND_TARGET`. مسارات الإدارة تمرر Bearer admin token؛ `POST/DELETE /api/admin/debug-toggle` يحتاجان كذلك Cookie وOrigin، وعمليات الكتابة الإدارية الأخرى لا تعمل حتى تضيف payload صالحًا في الإعداد. `POST /api/internal/cache/revalidate` يدعم توقيع HMAC-SHA256 تلقائيًا لكنه معطل افتراضيًا لأنه يغير الكاش. `GET /api/internal/cache/revalidate` يتوقع 405 عمدًا لاختبار رفض الطرق غير المدعومة.
8. Keepalive Worker يحتاج `LOAD_TEST_KEEPALIVE_TARGET` مستقلًا. الجرد يختبر status endpoint فقط، ولا يشغّل المهام المجدولة أو الاتصالات outbound.
9. عمليات Edge admin تتطلب رؤوسها الخاصة (`x-gateway-admin-token`, `x-feature-flags-token`, `x-purge-token`). عمليات الكتابة أو مسح الكاش تحتاج كذلك `include_mutations=true` وجسم طلب صحيحًا. اتركها معطلة ما لم تكن تختبر نسخة Worker تجريبية.
10. لا ينشئ المحرك IDs عشوائية ولا يخمّن أجسام الطلبات ولا يختار سجلات عشوائية للحذف.

هناك مثال `POST /ads` معطّل افتراضيًا يوضح Multipart وملف صورة اختباري. تفعيله ينشئ سجلات جديدة وقد يستهلك خدمة رفع الصور؛ لا تشغله إلا في قاعدة بيانات اختبار مخصصة، واستخدم آلية تنظيف منفصلة للسجلات التي أنشأها. لا يوجد حذف تلقائي للسجلات بعد انتهاء الاختبار.

## التغطية: ماذا تعني الأرقام؟

يحتوي التقرير على أربع حالات منفصلة:

- **Inventory**: كل عمليات HTTP المكتشفة في المصدر.
- **Eligible**: العمليات التي اجتازت مفاتيح التفعيل والمجموعة والتوكنات والمعاملات والـ payloads.
- **Executed**: العمليات التي وصلها طلب واحد على الأقل.
- **Skipped / eligible but not exercised**: العمليات المرفوضة بسبب الإعداد أو التي لم يصلها الدور بسبب قصر مدة التشغيل.
- `coverage.byGroup` في JSON وجدول التقرير يفصل الجرد والمؤهل والمنفذ والمتخطى والطلبات والأخطاء لكل مجموعة.

`round-robin` يمر بالتناوب على قائمة العمليات المؤهلة لكل VU. لبلوغ تغطية كاملة يجب أن يسمح عدد الطلبات ومدة التشغيل بزيارة كل عملية. التقرير يذكر صراحة العمليات المؤهلة التي لم تُنفّذ؛ لا تعتبرها نجاحًا.

## التقارير والمقاييس

بعد كل تشغيل، ينتج المحرك:

| المخرج | المحتوى |
|---|---|
| `latest-report.md` | تقرير بشري مختصر، تغطية العمليات، التشخيص، وتقييم الحدود |
| `latest-summary.json` | البيانات الكاملة، كل المقاييس الخام من k6، نتائج كل عملية، التجاوزات والأخطاء |
| `latest-by-operation.csv` | طلبات وأخطاء وزمن استجابة كل عملية، مناسب للتحليل في Excel |
| `error-samples.json` | عينة منظمة من سجلات `[LOAD_TEST_ERROR]`؛ يُنشأ من سجل k6 بواسطة خطوة الـ Workflow أو أمر `jq` أعلاه |
| `k6-console.log` | سجل k6 الكامل، بما فيه العينات التشخيصية |

المقاييس الأساسية: إجمالي الطلبات، Requests/sec، معدل الفشل، نسبة نجاح Checks، عدد VUs، عدد Iterations وDropped Iterations، البيانات المرسلة والمستقبلة، وp50/p90/p95/p99/max. كما تُقاس مراحل `waiting` (TTFB)، `connecting`, `TLS`, `sending`, `receiving`, و`blocked`، إضافةً إلى إحصاءات كل Endpoint. وعند المرور عبر Cloudflare، يسجل التقرير قيم `cf-cache-status` و`x-proxy-cache` و`x-mp-route-mode` و`x-mp-go-service` و`x-mp-route-attempts` لمعرفة سلوك الكاش والتوجيه.

تصنيف الأخطاء: `timeout`, `network_or_tls`, `unauthorized_401`, `forbidden_403`, `rate_limited_429`, `client_4xx`, `server_5xx`, و`unexpected_response`. تُرفق عينات محدودة ومنقحة، مع `requestId` و`CF-Ray` للمطابقة مع سجلات Express وCloudflare عند توفرها. لا تُطبع ترويسات Authorization.

تُرفع النتائج كـ Artifact في GitHub Actions لمدة 30 يومًا، ويُنشر تقرير Markdown في ملخص التشغيل. الفشل في Thresholds يجعل خطوة k6 تفشل مع الإبقاء على التقارير كـ Artifact.

## التحقق والصيانة

```bash
npm run loadtest:verify
```

هذا الأمر يتحقق من أن ملف الجرد المولّد يطابق ملفات routes الحالية، وأن مفاتيح التهيئة تشير إلى Routes موجودة، وأن المجموعات والـ thresholds والـ payload examples سليمة. عند إضافة Route:

```bash
npm run loadtest:inventory
npm run loadtest:verify
```

ثم أضف إعدادات العملية في `workload.config.js` عند الحاجة. الـ Workflow يعيد التوليد من المصدر في كل تشغيل كي لا يستبعد Route جديدًا لمجرد أن الملف المولّد لم يُحدّث بعد.

## تنبيه القياس

هذا اختبار HTTP من جهة العميل. يقيس زمن الطلب من منظور الحمل، ولا يستنتج وحده CPU/RAM للخادم أو استهلاك PostgreSQL/Redis. لم تُضف قراءة تخمينية لمقاييس الخادم؛ يمكن دمج Prometheus/Grafana لاحقًا من خلال مصادر المراقبة الفعلية إذا أردت قياس موارد الخادم وقاعدة البيانات بالتزامن.
