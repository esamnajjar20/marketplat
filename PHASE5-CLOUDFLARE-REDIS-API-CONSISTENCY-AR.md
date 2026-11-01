# تقرير المرحلة الخامسة — Cloudflare + Redis + API + اتساق البيانات

التاريخ: 2026-11-01

## حالة التنفيذ

تم استكمال إصلاحات Cloudflare Worker ومسار إبطال Edge Cache في API وإضافة اختبارات Worker مرتبطة بها. هذه الحزمة مبنية على مصدر المرحلة الرابعة `marketplat-offline-sqlcipher-phase4-updated.zip` وتحافظ على ملفات المراحل السابقة.

**ليست هذه شهادة اكتمال إنتاجي للمرحلة الخامسة بالكامل**: لم تتوفر بيئة Redis/Cloudflare إنتاجية ولا أسرار النشر، كما أن اختبارات Jest الخاصة بالـ API لم يمكن تشغيلها لعدم وجود `node_modules` في هذه البيئة. لذلك فصلت أدناه ما تم التحقق منه محليًا عما يتطلب إعدادًا أو اختبارًا حيًا.

## التعديلات

### 1. Cloudflare Worker

- جعل `RENDER_ORIGIN` إعدادًا قابلًا للضبط مع تحقق صارم من أنه HTTPS origin فقط، دون credentials أو path أو query أو fragment.
- توحيد أصل Cache API ومفاتيح التخزين وطلبات الـ warm-up مع `RENDER_ORIGIN` الفعلي.
- إحاطة عمليات Cache API (`match` و`put`) بحماية من الاستثناءات؛ فتعطل طبقة الكاش لا يمنع تمرير الطلب إلى الـ API.
- الحفاظ على `Cache-Tag` عند إعادة التحقق عبر upstream `304`، مع إبقاء tags المخزنة وإرجاعها للعميل.
- جعل فشل `POST /__purge__` يرجع `503` و`ok:false` بدل إظهار نجاح كاذب.
- إضافة Cron فعلي `*/4 * * * *` في `wrangler.toml` لتشغيل warm-up المجدول.
- إضافة اختبار CORS يثبت عدم عكس Origin عشوائي عند السماح بالـ credentials. يجب ضبط `FRONTEND_ORIGIN` في Cloudflare Worker Variables بالقيم الفعلية المسموح بها (قائمة مفصولة بفواصل). عند غياب الإعداد، يفشل CORS للمتصفح بشكل مغلق بدل السماح لأي موقع.

### 2. API Edge Purge

- تفعيل إبطال Cache-Tag مشروط بثلاثة أمور: kill switch صريح `CF_CACHE_TAG_PURGE_ENABLED=true`، وZone ID، وAPI Token. وجود الأسرار وحده لا يرفع TTL ولا يرسل purge.
- قبول نجاح Cloudflare فقط عندما تكون HTTP ناجحة ويحتوي JSON على `success:true` صراحةً. HTTP 200 مع `success:false` أو JSON مفقود/غير صالح لا يُعد نجاحًا.
- إبقاء tags الفاشلة في قائمة الانتظار وإعادة المحاولة بدل إسقاطها.
- تجزئة طلبات purge إلى دفعات لا تتجاوز 30 tag.
- عند امتلاء القائمة، دمج الإبطال إلى tag شامل `api` بدل إسقاط invalidations بصمت.
- إضافة تراجع أطول لأخطاء 4xx الدائمة (5 دقائق بدل تكرارها كل 30 ثانية)، مع إبقاء tags للمحاولة لاحقًا.
- إبقاء TTL الأطول للإعلانات معطلًا ما لم يتم تفعيل purge صراحةً؛ القيم الافتراضية لا تتغير.

### 3. اختبارات أضيفت/حدثت

- Worker: CORS fail-closed، Cache API failures، `304` مع الاحتفاظ بالـ tags، Cron، Origin قابل للضبط والتحقق منه، purge KV failure، وcache/tag invariants.
- API Jest: حالات `HTTP 200` دون `success:true`، JSON غير صالح، `success:false`، إعادة المحاولة، والتراجع عند 4xx الدائمة.

## نتائج التحقق المحلي

- `node workers/cf-api-proxy/cache-policy.test.mjs` — PASS.
- `node --check workers/cf-api-proxy/worker.js` — PASS.
- `node --check workers/cf-api-proxy/cache-policy.test.mjs` — PASS.
- `node --check workers/cf-api-proxy/cache-probe.mjs` — PASS.
- اختبار Jest لـ `apps/api/tests/unit/edgePurge.test.ts` لم يُشغّل: لا توجد `node_modules` في نسخة العمل.
- TypeScript full check لم يُشغّل بنجاح؛ محاولة الفحص المعزولة أظهرت غياب تعريفات Node/Jest/Express واعتماديات المشروع، لذلك لا أعتبرها نتيجة type-check للمشروع.

## ما بقي قبل اعتبار المرحلة الخامسة مكتملة إنتاجيًا

1. ضبط `FRONTEND_ORIGIN` في إعدادات Cloudflare Worker إلى أصل/أصول الواجهة الحقيقية. لا أضع قيمة تخمينية لأن النطاق النهائي غير مثبت في الملفات.
2. التحقق من أن Worker منشور على Route ضمن Zone مناسبة إذا كان المطلوب Cloudflare purge-by-tag عالميًا؛ عنوان `workers.dev` وحده لا يثبت جاهزية هذا المسار.
3. إعداد `CF_PURGE_ZONE_ID` و`CF_PURGE_API_TOKEN` ثم تفعيل `CF_CACHE_TAG_PURGE_ENABLED=true` بعد التحقق من Route والصلاحيات.
4. إعداد `EDGE_WORKER_PURGE_URL` و`EDGE_WORKER_PURGE_TOKEN` فقط إذا كان مطلوبًا مسح Workers KV المرجعي.
5. اختبار Redis disconnect/reconnect وTTL وعمليات invalidation على Redis في بيئة تشغيل فعلية.
6. اختبار اتساق إعلان بعد التعديل/الإخفاء/الحذف عبر PostgreSQL ثم API ثم Cloudflare ثم React Query والتخزين المحلي Offline، واختبار عزل مستخدم بعد logout.
7. تشغيل Jest وTypeScript check بعد تثبيت اعتماديات المشروع، ثم اختبار نشر/Smoke test على Cloudflare وRender.

## ملاحظة موثوقية مهمة

قائمة `pending` الخاصة بإبطال Cache-Tag في API ما زالت ذاكرة داخل عملية Node وليست Outbox دائمًا في PostgreSQL/Redis. تحفظ الإخفاقات أثناء حياة العملية وتعيد المحاولة، لكنها لا تضمن بقاء tags إذا توقفت العملية فجأة قبل إتمام purge. لا أصفها بأنها durable queue. تحويلها إلى Redis/DB outbox يحتاج تصميمًا واختبارات تنافسية مستقلة قبل اعتماده.

## الملفات المعدلة في هذه المرحلة

- `apps/api/.env.example`
- `apps/api/src/config/env.ts`
- `apps/api/src/shared/cache/edgePurge.ts`
- `apps/api/tests/unit/edgePurge.test.ts`
- `workers/cf-api-proxy/worker.js`
- `workers/cf-api-proxy/cache-policy.test.mjs`
- `workers/cf-api-proxy/wrangler.toml`
- `workers/cf-api-proxy/wrangler.example.jsonc`

لم يتم نقل `frontend/` إلى workspace؛ بقاؤه مستقلًا محفوظ كما طلبت سابقًا.
