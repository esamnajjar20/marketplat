# تقرير تحويل MarketPlat Cloudflare Worker إلى TypeScript

التاريخ: 2026-11-02

## النتيجة

تم نقل مصدر Worker الخاص بـ `workers/cf-api-proxy` من JavaScript إلى TypeScript. مصدر النشر الحالي هو `worker.ts`، وملفات Wrangler تشير إليه مباشرة. أزيل `worker.js` القديم من جذر الحزمة حتى لا يستطيع مسار نشر قديم اختيار نسخة JavaScript السابقة دون قصد.

لم أعد كتابة منطق الكاش أو التوجيه من الصفر؛ أبقيت التنفيذ الحالي وعقوده التشغيلية، ورفعت سلامة الأنواع والتحقق عند حدود البيانات، ثم جعلت اختبار الانحدار يقرأ ناتج TypeScript المترجم.

## هندسة الأنواع التي أضيفت

1. `src/types.ts` يجمع العقود المشتركة: `Env` وواجهات KV وDurable Object وExecution Context وAnalytics، بالإضافة إلى Registry وHealth وCache ونتائج التوجيه.
2. استخدمت اتحادًا مميزًا `GatewayServer = BackendServer | FrontendServer` عن طريق `healthKind`. بيانات Frontend تتطلب `buildId` و`releasePath`، بينما Backend لا يمكن أن يحمل هذه الحقول. أضيفت overloads للتحقق من السيرفر بحيث ينتج عن التحقق نوع مضبوط حسب المجموعة، دون casts غير ضرورية عند بناء القوائم.
3. مدخلات JSON القادمة من الشبكة وKV وDurable Object تبدأ كـ `unknown`. تُمرر عبر `isRecord` وعمليات تحقق واضحة قبل استخدامها. أضيف `parseGatewayHealthStates` ليُرفض أي سجل صحة مخزن لا يطابق العقد، بدل افتراض صحة بيانات التخزين.
4. تم توحيد نوع الأخطاء إلى `unknown` عبر `useUnknownInCatchVariables`، وإضافة `errorMessage` للتعامل الآمن مع مصادر الخطأ.
5. أزيلت imports والمتغيرات والمعاملات غير المستخدمة، وأزيل اعتماد Worker على `any` في المصدر.

## إعداد TypeScript

يستخدم `tsconfig.json` الإعدادات التالية:

- `strict: true` و`noImplicitAny: true`.
- `noUncheckedIndexedAccess: true`.
- `exactOptionalPropertyTypes: true`.
- `noUnusedLocals: true` و`noUnusedParameters: true`.
- `useUnknownInCatchVariables: true`.
- `isolatedModules: true` و`forceConsistentCasingInFileNames: true`.
- `noEmitOnError: true`.

الـ target هو ES2022، ووحدة البناء ES Modules، مع DOM/Fetch types. لا توجد مكتبة runtime إضافية أُدخلت إلى Worker؛ TypeScript اعتماد تطوير فقط.

## ربط البناء والنشر والاختبار

- `workers/cf-api-proxy/wrangler.toml`: `main = "worker.ts"`.
- `workers/cf-api-proxy/wrangler.example.jsonc`: `main = "worker.ts"`.
- `package.json` داخل Worker يوفّر `build`, `type-check`, `test`, و`check`.
- `test` يبني `dist/worker.js` من `worker.ts` ثم يشغّل `cache-policy.test.mjs` على نفس الملف المترجم. هذا يمنع اختبار نسخة JavaScript قديمة منفصلة عن المصدر المنشور.
- أضيفت أوامر workspace في الجذر: `type-check:worker` و`check:worker`.
- حُدّث `frontend/scripts/cache-layer-audit.mjs` وتعليق API الذي يشير إلى مصدر Worker، وحُدّث دليل Smart Gateway وتقرير المرحلة الرابعة.
- أزيل `workers/cf-api-proxy/package-lock.json` الصغير غير المستخدم، وأصبح `pnpm-lock.yaml` في الجذر هو قفل الاعتماديات الوحيد لهذا الـ workspace.

## نتائج التحقق التي نُفذت في بيئة العمل

| الأمر / الفحص | النتيجة |
|---|---|
| `tsc --noEmit -p tsconfig.json` | PASS — دون أخطاء، بما فيها exact optional properties وunused checks |
| `tsc -p tsconfig.json` | PASS — أنتج `dist/worker.js` |
| `node cache-policy.test.mjs` بعد البناء | PASS — cache policy وSWR وnegative cache وKV tier وtags وsingle-flight والتوجيه وfailover، مع warm-up disabled |
| `node frontend/scripts/cache-layer-audit.mjs` | PASS — CACHE W1-W10 |
| `node frontend/scripts/navigation-integrity-audit.mjs` | PASS — 26/26 |
| تحليل `wrangler.toml` وفحص نقطة الدخول | PASS — `worker.ts` هو `main` ولا توجد Cron triggers |

استخدمت نسخة TypeScript المتاحة في بيئة التنفيذ (5.8.3). ملف الحزمة يطلب `typescript: ^5.9.3` ويربطه ملف pnpm lock بالنسخة 5.9.3 الموجودة أصلًا في مخزن المشروع؛ لم أدّعِ أن compiler 5.9.3 شُغّل محليًا في هذه الجلسة.

## ما لم أتمكن من التحقق منه

- لم أشغّل `wrangler types` ولم أنشئ `worker-configuration.d.ts` مولدًا من حساب/إعداد Wrangler؛ أداة Wrangler غير مثبتة في بيئة التنفيذ ولم أضف اعتمادًا غير محلول إلى lockfile. الأنواع الموجودة حاليًا عقود TypeScript محلية صريحة للبيئة والـ bindings. توصي Cloudflare بتوليد الأنواع المطابقة لـ compatibility date والـ bindings من إعداد Wrangler ثم إدراجها في إعداد TypeScript؛ هذه خطوة مناسبة قبل CI/النشر النهائي. <https://developers.cloudflare.com/workers/languages/typescript/>
- لم أنفذ `wrangler deploy` أو `wrangler deploy --dry-run`، ولم أطبق migration على حساب Cloudflare.
- لم أشغّل `pnpm install --frozen-lockfile` لأن أداة `pnpm` غير متاحة في بيئة التنفيذ. أُبقيت نسخة TypeScript المحلولة 5.9.3 كما هي في `pnpm-lock.yaml` من سجل المشروع وأزيل إدخال Wrangler غير المحسوم.
- فشل `node tooling/verify-workspace.mjs` لأنه يبحث عن `apps/web/package.json` غير الموجود في هذه النسخة (الموجود هو `frontend/package.json`). لم أغيّر هيكل الـ workspace خارج نطاق طلب Worker.
- لم أشغّل `next build` أو فحوص الواجهة/الباك إند الشاملة؛ نطاق هذه الجولة هو Cloudflare API Worker وتوابعه المباشرة.

## الحفاظ على السلوك والقيود

- لم أغير أسماء API أو مفاتيح Registry أو أسماء bindings أو أسماء ملفات إعدادات الإنتاج.
- بقي `GATEWAY_HEALTH` وSQLite migration `v1` كما هما.
- بقي فصل Backend/Frontend، الأوزان والأولويات والمهلات، Failover الآمن لـ GET/HEAD، والـ Frontend build affinity.
- لم يُضف Cron أو Alarm أو background probe؛ Warmup لا يزال معطلًا، ويعيد `/__warm__` حالة 404.
- `worker.ts` هو مصدر النشر، و`dist/worker.js` ناتج اختبار/بناء محلي متجاهل في Git وليس ملف المصدر.

## الأوامر بعد تثبيت الاعتماديات من جذر المشروع

```bash
pnpm install --frozen-lockfile
pnpm --filter @marketplat/cf-api-proxy type-check
pnpm --filter @marketplat/cf-api-proxy test
```

للنشر، ادخل إلى مجلد `workers/cf-api-proxy` واستخدم Wrangler بعد توليد/مراجعة types الخاصة ببيئة الحساب وإعداد الـ bindings والـ secrets والـ routes. لم يتم أي نشر إنتاجي ضمن هذه المهمة.
