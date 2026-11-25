# تقرير الإصلاحات — MarketPlat

**النطاق:** ESLint، TypeScript type-check، إعدادات pnpm، فحوص CI، وقيود بعض مدخلات Zod.  
**النسخة الأساس:** `marketplat-main.zip` المرفق في المحادثة.  
**حالة التسليم:** إصلاحات بنيوية وكودية مطبقة، مع تبعيات أمنية تحتاج استكمالًا بعد عودة الاتصال بسجل الحزم.

## 1. ملخص تنفيذي

تم تطبيق إصلاحات على تغطية ESLint وTypeScript، وإعداد pnpm، وتكامل CI، وفحوص بنية مساحة العمل. كما أضيفت حدود لمصفوفات إعادة ترتيب الصور والمجموعات، واختبارات Regression لهذه الحدود.

**لم أغيّر إصدارات Zod أو `@typescript-eslint` في ملفات manifests من دون تحديث lockfiles واختبار التوافق.** سجل npm لم يكن متاحًا في بيئة التنفيذ؛ لذلك فإن ترك manifests وlockfiles متسقة أكثر أمانًا من تعديل الإصدارات وترك التثبيت الحتمي مكسورًا.

## 2. الإصلاحات المنفذة

### 2.1 ESLint وTypeScript

- `apps/api/package.json`: أصبحت أنماط `src/**/*.ts` مقتبسة في أوامر `lint` و`lint:fix` و`format` و`format:check` حتى يعالج ESLint/Prettier كل الملفات المتداخلة بدل الاعتماد على توسيع glob من الـ shell.
- `apps/mobile/.eslintrc.cjs`: أضيفت قاعدة `@typescript-eslint/no-unused-vars` كتحذير، مع السماح ببادئة `_` للمتغيرات والمعاملات المقصود تجاهلها.
- `frontend/package.json`: أضيف `type-check:scripts` لتشغيل فحص ملفات `.mts` و`.cts` باستخدام `tsconfig.scripts.json` الموجود في جذر المشروع.
- `package.json`: أضيف فحص E2E وفحص السكربتات إلى `type-check:all`، وأضيفت أوامر جذرية مستقلة لـ E2E وللسكربتات.
- `tsconfig.scripts.json`: جرى تحديد مسارات تعريفات Node من مجلدات تثبيت pnpm والويب، واستثناء `tools/user-simulator/**` لأنه مشروع npm منفصل لا تثبت تبعياته ضمن تثبيت مساحة pnpm أو وظيفة الويب.
- `.github/workflows/ci.yml`: أضيف فحص TypeScript لملفات Playwright E2E إلى وظيفة الويب، وأنشئت وظيفة مستقلة لفحص السكربتات؛ وهي تثبت تبعيات مساحة pnpm وتبعيات الويب npm قبل الفحص حتى تكون استيرادات API وContracts وWorkers متاحة.
- `tools/verify-workspace.mts`: أضيفت حواجز تتحقق من وجود أوامر الفحص الجديدة في manifests وCI، ومن وجود إعداد `tsconfig.scripts.json`.

### 2.2 إصلاحات CI ومساحة العمل

- `.github/workflows/workspace-foundation-validation.yml`: أزيلت أوامر `pnpm exec turbo` لأن المشروع يثبت `pnpm@10.18.0` ولا يعلن `turbo` كتبعية. بقيت فحوص المساحة وPrisma وContracts وMobile وWorker.
- `package.json`: أضيف `verify:prisma-layout` وربط بـ `verify:all`؛ وهذا يطابق الأمر الذي كان Workflow يستدعيه دون أن يكون له script جذري.
- `pnpm-workspace.yaml`: أزيل إعداد `allowBuilds` الذي أضيف في pnpm 10.26 بينما المشروع مثبت على 10.18.0. أبقيت `onlyBuiltDependencies` كقائمة السماح المتوافقة مع إصدار pnpm المثبت. كما رُفعت `minimumReleaseAge` من صفر إلى 1440 دقيقة.
- `.npmrc`: أزيلت قيود التثبيت على Linux/x64/glibc فقط حتى لا تمنع التبعيات الاختيارية المناسبة لأنظمة المطورين الأخرى.

### 2.3 توحيد متطلبات Node

- `apps/api/package.json` و`apps/api/package-lock.json`: توحيد الحد الأدنى مع الجذر إلى `Node >=22.18 <25`، مع مزامنة بيانات محرك Node في رأس lockfile.
- `tools/user-simulator/package.json` و`tools/user-simulator/package-lock.json`: المزامنة نفسها مع شرط الجذر.

### 2.4 حماية مدخلات Zod وإضافة اختبارات

- `apps/api/src/modules/classifieds/ads/ads.validation.ts`: نقل التحقق عن صور الإعلان إلى schemas مركزية؛ قائمة إعادة الترتيب محدودة بـ 20 رابطًا صالحًا على الأكثر.
- `apps/api/src/modules/classifieds/ads/ads.controller.ts`: أصبح المتحكم يستخدم الـ schemas المركزية بدل إنشاء schemas inline.
- `apps/api/src/modules/commerce/collections/collections.validation.ts`: أصبحت `orderedIds` غير فارغة ومحدودة إلى 1,000 عنصر.
- `apps/api/tests/unit/ads.validation.extended.test.ts`: اختبارات قبول/رفض روابط الصور، والقائمة الفارغة، وتجاوز الحد.
- `apps/api/tests/unit/collections.validation.test.ts`: اختبارات القائمة الفارغة، والمعرّفات الفارغة، وحد 1,000 عنصر وتجاوزه.

## 3. نتائج التحقق التي أمكن تنفيذها

| الفحص | النتيجة | الملاحظات |
|---|---|---|
| تحليل 12 ملف manifest/lock بصيغة JSON | ناجح | لم تظهر أخطاء JSON |
| تحليل YAML لملفات workspace وCI الرئيسية | ناجح | شمل `pnpm-workspace.yaml` وملفي Workflow المعدلين |
| مزامنة Node engines بين manifest وnpm lock | ناجح | API ومحاكي المستخدم |
| التحقق البنيوي لمساحة العمل | ناجح | `node --experimental-strip-types tools/verify-workspace.mts` |
| التحقق البنيوي لـ Prisma | ناجح مع تحذيرين سابقين | لا توجد قاعدة بيانات متصلة؛ راجع أدناه |
| فحص صياغة إعداد ESLint للموبايل | ناجح | `node --check apps/mobile/.eslintrc.cjs` |
| TypeScript / ESLint / Jest الفعلية | لم تكتمل | لم تكن dependencies مثبتة، كما أن اتصال سجل npm/DNS فشل |

**تحذيرا Prisma اللذان ظهرا في الفحص البنيوي:**

1. Migration سجل إعادة التشغيل الدائم لا يعرّف foreign keys إلى `ads/users`؛ يلزم تأكيد أن هذا قرار مقصود.
2. لم يجد الفاحص مرجعًا في كود التطبيق إلى `AdImageOfflineOperation`؛ يلزم تأكيد أن نموذج التخزين موصول بالميزة فعلًا.

هذه تحذيرات خارج نطاق إصلاحات Lint/Type-check، ولم أغيّر مخطط قاعدة البيانات دون تدقيق مستقل.

## 4. ما بقي غير محلول ولماذا

### 4.1 Zod — ثغرة أمنية عالية الخطورة

لا يزال المستودع يثبت Zod 3: يوجد override في pnpm إلى `3.22.0`، والويب يحل إلى إصدار 3.x. النشرة GHSA-mrhx-c7xc-m3w5 تصنف الإصدارات الأقل من `4.6.6` متأثرة بمشكلة استهلاك ذاكرة عند التحقق من مصفوفات كبيرة غير محدودة. الإصلاح المنشور يبدأ من `4.6.6`، ولذلك لا يكفي تحديث إصدار 3.x.

تمت إضافة حدود للمصفوفات التي ظهرت في مدخلات API (صور الإعلانات وإعادة ترتيب المجموعات) كإجراء تخفيفي، لكنها **لا تعادل ترقية Zod ولا تلغي التحذير الأمني**. ترقية Zod إلى 4 تحتاج مهاجرة schemas، ومراجعة استخدامات `errorMap` وواجهات Zod 3، ثم تحديث جميع lockfiles واختبارات API والويب والموبايل.

المراجع:
- [GitHub Advisory GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)

### 4.2 `@typescript-eslint` غير متوافق رسميًا مع TypeScript المحلول

ملفا pnpm ما زالا يحلان `@typescript-eslint/parser` و`eslint-plugin` إلى `6.21.0`، بينما TypeScript في API هو `5.9.3` وفي Mobile هو `6.0.3`. وثائق فرع typescript-eslint v6 تحدد نطاق TypeScript المدعوم بأنه أقل من `5.2.0`، وبالتالي الإصداران الحاليان خارج النطاق المدعوم. فرع v8 يدعم TypeScript من `4.8.4` إلى ما قبل `6.1.0`، وهو متوافق مع أرقام TypeScript الحالية.

لم أرفع إصدارات manifests وحدها لأن هذا يتطلب تجديد `pnpm-lock.yaml` وتشغيل ESLint على API وMobile؛ سجل الحزم لم يكن متاحًا.

المراجع:
- [دليل توافق typescript-eslint v6](https://v6--typescript-eslint.netlify.app/users/dependency-versions/)
- [دليل التوافق الحالي](https://typescript-eslint.io/users/dependency-versions/)

### 4.3 اختلاف lockfiles ومديرو الحزم

الـ API ما زال لديه `package-lock.json` ويُستخدم `npm ci` في CI، بينما المشروع يضم API ضمن `pnpm-lock.yaml`. النسخ المحلولة تختلف في بعض الحزم. لم أبدل مدير الحزم أو أحذف lockfile؛ لأن ذلك يتطلب قرارًا موحدًا وتوليد lockfile قابل للتثبيت.

### 4.4 تغطية Lint ليست شاملة بعد

- `packages/contracts` و`workers/cf-api-proxy` و`workers/keepalive-worker` لا تزال تفتقر إلى أوامر ESLint مخصصة.
- فحص API الحالي يغطي `src/**/*.ts`؛ لا يضيف تلقائيًا lint لملفات الاختبارات والسكربتات الخارجية.
- `tools/user-simulator` مستثنى من فحص `.mts/.cts` العام لأنه مشروع npm مستقل. يحتاج خطوة تثبيت TypeScript/تعريفات منفصلة كي يضاف دون التسبب بأخطاء module-resolution كاذبة.

### 4.5 تدقيق التبعيات في CI

فحص `npm audit --audit-level=high` في وظيفة الويب ما زال `continue-on-error: true`. لم أحوله إلى بوابة فشل في هذه الدفعة لأن Zod المتأثر ما زال موجودًا، وتحويله الآن سيجعل CI يفشل حتمًا قبل استكمال الترحيل الأمني.

## 5. خطوات الاستكمال المطلوبة عند عودة الاتصال بسجل الحزم

1. ترحيل Zod إلى `4.6.6` أو أحدث، ومعالجة اختلاف واجهات v3، ثم تجديد pnpm وnpm lockfiles.
2. رفع `@typescript-eslint/parser` و`@typescript-eslint/eslint-plugin` في API وMobile إلى إصدار v8 متوافق (يمكن اعتماد `8.72.2` الموجود حاليًا في Lock الويب كبداية)، وتجديد `pnpm-lock.yaml`.
3. حسم اعتماد API على npm lock أو pnpm lock، ثم إزالة مصدر الاختلاف بدل استمرار تثبيت شجرتين.
4. تثبيت التبعيات وتشغيل: `pnpm install --frozen-lockfile`، و`npm ci` للويب، ثم `pnpm run lint:all` و`pnpm run type-check:all` و`pnpm run test:all` و`pnpm run build:all`، إضافة إلى `npm audit` بعد إصلاح Zod.
5. إضافة lint/type-check مخصص لـ Contracts وWorkers وUser Simulator، ثم جعل تدقيق الثغرات حاجز CI بعد تصفير التحذيرات عالية الخطورة.

---

**الخلاصة:** تم تطبيق إصلاحات حقيقية على ملفات المشروع وأُنشئ Patch يحافظ على مساراته. لكن لا يصح وصف حالة التبعيات الأمنية بأنها مكتملة إلى أن يُهاجر Zod وتُحدّث إصدارات TypeScript-ESLint مع تجديد lockfiles وتشغيل الاختبارات في بيئة متصلة ومثبتة التبعيات.
