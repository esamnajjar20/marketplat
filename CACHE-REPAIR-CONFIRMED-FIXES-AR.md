# إصلاحات الملاحظات المؤكدة — MarketPlat Cache Round 2

## الملفات المعدلة

1. `apps/api/src/appwrite-entry.ts`
   - استعادة تصفية ترويسات Hop-by-Hop، بما فيها الترويسات التي تسميها `Connection`.
   - تطبيع أسماء الترويسات والقيم النصية/الرقمية/المصفوفات.
   - ضمان أن `rawPath` يبدأ بـ `/` وإزالة `?` البادئة من `rawQueryString`.
   - عدم إرسال جسم مع GET/HEAD.
   - الحفاظ على `bodyRaw: ''` وعدم تحويله خطأً إلى `{}`.
   - دعم `Uint8Array` كجسم Base64 مع ضبط `isBase64Encoded` بصورة صحيحة.
   - التحقق من وجود `req` وإرجاع 400 عند غيابه.
   - عدم كشف `err.message` للعميل؛ التفاصيل تبقى في سجل Appwrite.
   - تطبيع ترويسات الاستجابة أيضًا قبل تمريرها إلى `res.send`.

2. `apps/api/src/config/env.ts`
   - لا يُعتبر هدف Worker مكتمل الإعداد إلا إذا كان URL موجودًا والسر بعد trim بطول 32 حرفًا على الأقل.
   - تبقى أهداف Zone وNext.js مستقلة؛ سر Worker غير الصالح لا يعطل هدفًا آخر صالحًا.

3. `apps/api/src/shared/cache/edgePurge.ts`
   - توحيد فحص طول سر Worker في `isWorkerCachePurgeEnabled` و`isEdgePurgeEnabled`.
   - جعل إرسال Purge إلى Worker ومرجع KV يمر عبر الفحص نفسه، لمنع تجاوز شرط طول السر في مسارات النقل.

4. `frontend/lib/offlineCacheInvalidation.ts`
   - استخدام `getActiveSW` بدل انتظار `navigator.serviceWorker.ready` مباشرة.
   - وضع مهلة إجمالية مستهدفة قدرها ثانية واحدة تشمل الحصول على العامل وانتظار ACK، مع استمرار إبطال التخزين المحلي قبل ذلك.
   - إغلاق طرفي MessageChannel عند انتهاء المهلة.

5. الاختبارات والتدقيق
   - إضافة اختبارات وحدة لمحول Appwrite.
   - إضافة اختبارات رفض سر Worker القصير مع الحفاظ على عمل هدف Purge بديل صالح.
   - تحديث Smoke Audit ليتحقق من مهلة SW الجديدة بدل القيمة القديمة 2500ms.

## الفحوص التي نُفذت

- `cache-invalidation-ack-audit.mjs`: 5/5 PASS.
- `cache-final-audit.mjs`: PASS (W1–W12).
- `cache-layer-audit.mjs`: PASS.
- `cache-contract-audit.mjs`: PASS (24 domains / 16 rules).
- `offline-cache-truth-audit.mjs`: 36/36 PASS.
- TypeScript `transpileModule` syntax check للملفات الستة المعدلة/المضافة: PASS.

## ما لم يُختبر

- لم تُشغّل Jest ولا TypeScript project type-check؛ مجلدات `node_modules` غير متوفرة في بيئة الفحص.
- لم يُختبر Appwrite Runtime الفعلي أو التوافق الفعلي لكل ترويسات الاستجابة معه.
- لم يُختبر Redis/Cloudflare/D1/Next.js في بيئة الإنتاج.

## نقطة متبقية لا أدّعي إصلاحها

ما زال هناك احتمال نظري لسباق Intent الاحتياطي في Outbox إذا استمر طلب Mutation أكثر من مهلة الاسترداد (دقيقتان) دون أن ينتهي. لم أغيّر المهلة إلى رقم أكبر لأن ذلك لا يزيل السباق، ولم أضف heartbeat/lease protocol غير مختبر قد يسبب فقدان حدث أو تأخيرًا غير مقصود. يلزم تصميم واختبار دورة lease/heartbeat مستقلة قبل الادعاء بأن هذا السيناريو مغلق تمامًا.

## طريقة التطبيق

فك ضغط الحزمة من جذر المستودع `marketplat-main` مع الحفاظ على المسارات. الحزمة تحتوي الملفات المعدلة فقط بالإضافة إلى هذا التقرير.
