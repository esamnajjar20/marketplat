# تقرير استكمال إصلاح الكاش — الجولة الثانية

## ما أُنجز

1. **عمر مفاتيح Generation في Redis**
   - أضيف `GENERATION_TTL_SECONDS` بقيمة 7 أيام.
   - مفاتيح الجيل المنشأة لأول مرة (`NX`) والمحدّثة عند الإبطال أصبحت ذات TTL.
   - مدة الجيل أطول بكثير من Hard TTL لظروف الكاش الحالية؛ وعند انتهاء الجيل، لا يمكن لقيمة قديمة أن تُكتب مجددًا لأن Lua writer يشترط وجود الجيل ومطابقته قبل الكتابة.
   - أحداث إعادة المحاولة من Outbox تمر عبر تنفيذ TypeScript لضمان نفس عقد TTL؛ تم إيقاف Go fast-path لهذا النوع تحديدًا إلى أن يثبت Go تطبيق العقد نفسه.

2. **إقرار إبطال Service Worker**
   - `invalidateOfflineCachesForMutation` أصبحت async.
   - العميل يرسل MessageChannel وينتظر `INVALIDATE_API_CACHE_DONE` بدل اعتبار `postMessage` إقرارًا.
   - Service Worker يرسل ACK فقط بعد اكتمال حذف العناصر المطابقة من Cache Storage، ويرسل FAILED عند الخطأ.
   - الانتظار محدود بـ2.5 ثانية كي لا تتعلق نتيجة Mutation بسبب SW غير مستجيب.
   - تم ربط التعامل مع Promise في مسار إعادة تشغيل طابور Offline.

3. **اختبارات حماية جديدة**
   - أضيفت اختبارات مصدرية لعقد TTL في `cache-generation-outbox.test.ts`.
   - أضيف `frontend/scripts/cache-invalidation-ack-audit.mjs` بخمسة checks، وربط في Workflow `cache-integrity.yml`.

## نتائج تحقق محلية

- `cache-layer-audit.mjs`: ناجح.
- `cache-contract-audit.mjs`: ناجح (24 domain، 16 rule).
- `offline-cache-truth-audit.mjs`: 36/36.
- `cache-invalidation-ack-audit.mjs`: 5/5.
- `cache-final-audit.mjs`: W1–W12 ناجح.
- `node --check frontend/public/sw.js`: ناجح.

## حدود التحقق

- لم يمكن تشغيل Jest/Vitest أو TypeScript الكامل لـAPI/Frontend/Mobile لعدم وجود `node_modules` في الأرشيف. محاولة `tsc --noEmit -p tsconfig.test.json` أظهرت أخطاء اعتماديات مفقودة (`express`, `@prisma/client`, `@types/node`, Jest وغيرها)، ولذلك لا تُعد نتيجة فشل ترجمة للكود المعدل بحد ذاته.
- اختبار Cloudflare Worker يحتاج بناء TypeScript أولًا (`npm ci` ثم `npm run check` داخل `workers/cf-api-proxy`)؛ لم تتوفر اعتمادياته محليًا.
- لم يُجر اختبار حي على Redis أو D1 أو Cloudflare Cache API أو Next.js production. لذلك لا يمكن ادعاء ضمان إنتاجي قبل النشر وتشغيل Workflow واختبارات smoke على الموارد الفعلية.

## خطوات النشر الآمنة

1. ارفع الحزمة إلى فرع مراجعة، ولا تنشر مباشرة إلى الإنتاج.
2. شغّل CI كاملًا وانتظر نجاح Worker build/tests وAPI unit tests وFrontend audits.
3. انشر API أولًا مع عامل Outbox، وتحقق من استهلاك `EDGE_CACHE_PURGE` و`CACHE_GENERATION_BUMP` دون تراكم.
4. انشر API Worker ثم اختبر HIT → 304 revalidation → mutation → purge → MISS/نسخة محدثة.
5. انشر Frontend/Service Worker وتحقق من رسالة ACK بعد حذف Cache Storage.
6. اترك `REFERENCE_CACHE_PURGE_READY=false` و`REFERENCE_CACHE_LONG_TTL_ENABLED=false` حتى نجاح اختبار purge فعلي على D1 وCache API.

## ما لا يزال يحتاج إثباتًا حيًا

- نجاح Outbox end-to-end بعد قتل API بين commit وإرسال purge.
- صحة purge عبر Cache API وD1 بعد إعادة التحقق 304.
- تزامن Next.js Data Cache tag revalidation مع قاموس الوسوم الفعلي في بيئة الإنتاج.
- اختبار race بين mutation وGET في SQLite Mobile على جهاز فعلي.

هذه الجولة تقلل مخاطر الكود وتضيف حواجز اختبار، لكنها لا تحول الاختبارات المصدرية إلى إثبات تشغيل إنتاجي.
