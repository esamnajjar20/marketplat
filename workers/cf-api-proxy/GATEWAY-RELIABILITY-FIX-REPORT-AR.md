# تقرير إصلاح اعتمادية Gateway — MarketPlat

## نطاق الإصلاح

تم تعديل مسار API Worker وسجل Gateway ولوحة إدارة البنية التحتية، دون تغيير عناوين خوادم Render أو كلمات المرور أو مفاتيح الخدمات أو إعدادات قاعدة البيانات الفعلية.

## المشكلات التي عالجها التعديل

1. **خلط D1 مع Workers KV:** كان `getKv()` يعيد D1 عند وجود `DB`، مع أن أمر `wrangler kv key get` يقرأ Namespace مختلفة. أصبحت قراءة Registry تتعامل صراحةً مع D1 و`REFERENCE_KV`، وتختار النسخة الأعلى `version` ثم الأحدث `updatedAt`. لا تستخدم دالة كاش البيانات المرجعية لنسخة Gateway.
2. **نفاد حصة Durable Objects:** طلبات التوجيه العادية تقرأ النسخ الاحتياطية وتخزن النتيجة محلياً خمس دقائق، فلا تحتاج إلى Registry DO في كل cache miss. قراءة لوحة الأدمن الصريحة (`?refresh=1`) تتجاوز كاش Registry وتتحقق من المنسّق المركزي.
3. **تكرار طلبات DO بعد الفشل:** تمت إضافة exponential backoff محلي يبدأ بـ30 ثانية ويصل إلى 15 دقيقة. فشل Registry يوقف طلب لقطة الصحة الثاني فوراً لأنهما يشتركان في حصة DO نفسها. كما تتجنب عمليات الصحة إعادة المحاولة خلال فترة backoff.
4. **تدمير السجل الاحتياطي:** لا ينفذ Worker `registry/seed` بعد فشل DO. ولا يسمح بحفظ نسخة D1/KV عندما يكون المنسّق موجوداً لكنه غير متاح؛ تبقى النسخ الاحتياطية للقراءة فقط حتى عودة المصدر المركزي.
5. **تهيئة السجل لأول مرة:** تمت إضافة استثناء آمن يسمح بإنشاء أول سجل فقط عندما يرد Durable Object بنجاح ويؤكد أن `registry` فارغ. لا ينطبق الاستثناء على فشل الاتصال أو تجاوز الحصة.
6. **نسخ احتياطية غير متزامنة:** بعد نجاح CAS في Durable Object، يحاول Worker تحديث D1 وWorkers KV ويعيد `replicaStatus`. تعرض لوحة الأدمن تحذيراً إذا فشلت مزامنة إحدى النسخ أو كلها.
7. **إعدادات الإنتاج:** تمت إضافة `GATEWAY_REQUIRE_DURABLE_REGISTRY=true` إلى `wrangler.toml` ومثال JSONC، لمنع التراجع الصامت إلى حفظ Registry دون المنسّق في الإنتاج.
8. **تدقيق لوحة الأدمن:** تم تمرير `refresh=1` عبر Next.js Route Handler، وإظهار مصدر السجل وحالة المنسّق، وتعطيل التعديل والحفظ في وضع النسخة الاحتياطية، مع إتاحة تهيئة أول سجل عند تأكيد أن DO فارغ.
9. **مصدر نشر Worker:** حُذف ملف `workers/cf-api-proxy/worker.js` الجذري القديم الذي لا يستخدمه Wrangler. نقطة الدخول الصحيحة تبقى `worker.ts` وفق `wrangler.toml`. ملف `dist/worker.js` يُولّد للاختبار فقط ولا يُنشر كمصدر.

## الملفات المعدّلة

- `workers/cf-api-proxy/worker.ts`
- `workers/cf-api-proxy/src/types.ts`
- `workers/cf-api-proxy/wrangler.toml`
- `workers/cf-api-proxy/wrangler.example.jsonc`
- `workers/cf-api-proxy/cache-policy.test.mjs`
- `workers/cf-api-proxy/SMART-GATEWAY-IMPLEMENTATION-AR.md`
- `frontend/app/api/admin/gateway/registry/route.ts`
- `frontend/components/admin/AdminInfrastructureGateway.tsx`

ملف الحذف: `workers/cf-api-proxy/worker.js`.

## الفحوص المنفذة

- `npm run check` داخل `workers/cf-api-proxy`: **PASS** — TypeScript type-check، build، ومجموعة اختبارات Worker كاملة.
- اختبارات Gateway الجديدة تشمل: تعطل DO مع استعادة KV، منع الكتابة من النسخة الاحتياطية، عدم إرسال seed بعد الفشل، فضّ تعارض إصدار D1/KV، اختيار أحدث نسخة في المسار العادي، منع طلب DO صحي ثانٍ فور فشل Registry، وتهيئة DO فارغ فقط بعد تأكيد مركزي ناجح.
- `node scripts/gateway-proxy-audit.mjs` داخل `frontend`: **PASS — 8/8**.
- فحص بناء AST لملف TSX وموجه Next.js: **PASS**.

## ما لم يتم تنفيذه

- لم يتم نشر التعديلات إلى Cloudflare ولا إجراء اختبار مباشر بعد النشر.
- لم يُشغّل بناء Next.js الكامل أو type-check الكامل للواجهة؛ لم تكن تبعيات `frontend/node_modules` متوفرة في بيئة فحص الحزمة.
- لم نقرأ سجل Durable Object الحي، ولا نعرف بعد هل كان الخادم الخامس محفوظاً فيه. نسخة KV التي قرأها المستخدم تحتوي أربعة خوادم فقط.
- فحص `/health` الذي أجراه المستخدم أكد عمل خدمات Render الأربع وقت الاختبار، وليس كل مسارات API أو اتصالها بقواعد البيانات.

## ترتيب النشر والتحقق

1. احتفظ بنسخة من قيمة `gateway:registry:v1` الحالية في KV، ولا تحذف السجل الحالي ولا تضف خادماً خامساً بالتخمين.
2. استبدل ملفات `workers/cf-api-proxy` المعدّلة، واحذف الملف الجذري القديم `workers/cf-api-proxy/worker.js` إن كان ما زال موجوداً.
3. من مجلد `workers/cf-api-proxy` شغّل `npm run check` ثم انشر API Worker باستخدام إعداد Wrangler الحالي (`wrangler.toml`). لا توجد Migration جديدة لـ Durable Objects في هذا الإصلاح.
4. تحقق من أن `GATEWAY_ADMIN_TOKEN` مضبوط في API Worker وفي Frontend Worker، وأن Service Binding `API_WORKER` ما زال يربطهما.
5. انشر تحديث الواجهة بعد API Worker، ثم افتح لوحة Gateway واضغط تحديثاً صريحاً. إذا كان DO ما زال مستنفداً للحصة، يجب أن تظهر `D1 Replica` أو `KV Replica` بوضع القراءة فقط بدلاً من سجل fallback غير الموثوق.
6. عند عودة DO، أعد التحديث. يجب أن يظهر `Central Registry` إذا أمكن قراءة السجل المركزي. لا تحفظ من وضع النسخة الاحتياطية.

**قيد لا يمكن للكود تجاوزه:** إذا كانت حصة Durable Objects قد استُنفدت على حساب Cloudflare، فلن يجعلها هذا الإصلاح متاحة فوراً. الإصلاح يقلل الطلبات ويمنع تكرارها ويحافظ على النسخ الاحتياطية، لكن الكتابة الإدارية المركزية تظل محمية إلى أن يصبح DO متاحاً (بعد إعادة ضبط الحصة أو تغيير الخطة).
