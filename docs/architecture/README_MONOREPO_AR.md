# MarketPlat Monorepo — دليل التشغيل الأولي

## البنية الحالية

- `frontend/`: تطبيق Next.js 15 الحالي (App Router)، بما فيه PWA وCapacitor وملفات Android؛ يُدار عبر npm وملف `frontend/package-lock.json`.
- `apps/api/`: خادم Express الحالي، وPrisma schema وmigrations والاختبارات؛ عضو في مساحة pnpm، ولديه أيضًا `package-lock.json` خاص بمهام CI التي تستخدم npm.
- `workers/`: عمال Cloudflare الحاليون.
- `shared/`: عقود وسياسة الكاش المشتركة الحالية.
- `packages/`: الحزم المشتركة (ومنها `@marketplat/contracts`) ضمن مساحة pnpm.

لم يُحذف الويب ولم يُستبدل بتطبيق الموبايل. تطبيق React Native لم يُنشأ بعد.

## التثبيت

يتطلب المشروع Node.js 22 أو أحدث، وCorepack/pnpm 10.18.0. الواجهة منفصلة عن مساحة pnpm عمدًا؛ لا تضف `frontend/` إلى `pnpm-workspace.yaml` دون ترحيل lockfile كامل.

من جذر المستودع:

```bash
corepack pnpm install
corepack pnpm verify:workspace
```

استخدم ملف القفل الموجود كما هو عبر `corepack pnpm install --frozen-lockfile` لحزم API والموبايل والعقود وWorker.

## أوامر التشغيل والفحص

```bash
corepack pnpm dev:web
corepack pnpm dev:api
corepack pnpm dev:all
corepack pnpm build:web
corepack pnpm build:api
corepack pnpm type-check:web
corepack pnpm type-check:api
corepack pnpm test:web
corepack pnpm test:api
```

يمكن تشغيل أوامر npm الحالية داخل كل تطبيق عند الحاجة:

```bash
cd frontend && npm ci
# API: استخدم npm ci داخل apps/api فقط عند اتباع CI/npm workflow
```

لا تشغّل مديري الحزم بالتوازي على مجلد التطبيق نفسه. الواجهة تستخدم npm بشكل مستقل، وبقية حزم monorepo تستخدم pnpm محليًا؛ بعض وظائف CI تستخدم lockfiles الخاصة بها عمدًا.

## قبل النشر

لم يُثبت بعد أن البناء الكامل أو Playwright ينجحان بعد النقل. شغّل التحقق من المسارات، ثم بناء واختبارات الويب والـ API، ثم Smoke E2E وبناء Android/Cloudflare في بيئة CI. لا تنشر هذه المرحلة إلى الإنتاج قبل اجتياز هذه البوابات.
