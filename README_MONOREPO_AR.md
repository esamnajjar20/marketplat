# MarketPlat Monorepo — دليل التشغيل الأولي

## البنية الحالية

- `apps/web/`: موقع Next.js الحالي، بما فيه PWA وCapacitor وملفات Android.
- `apps/api/`: خادم Express الحالي، وPrisma schema وmigrations والاختبارات.
- `workers/`: عمال Cloudflare الحاليون.
- `shared/`: عقود وسياسة الكاش المشتركة الحالية.
- `packages/`: مخصص للحزم المشتركة الجديدة عند إثبات الحاجة إليها.

لم يُحذف الويب ولم يُستبدل بتطبيق الموبايل. تطبيق React Native لم يُنشأ بعد.

## التثبيت

يتطلب المشروع Node.js 22 أو أحدث ضمن المجال المحدد في `package.json`، وCorepack/pnpm 10.18.0.

من جذر المستودع:

```bash
corepack pnpm install
corepack pnpm verify:workspace
```

أول تثبيت عبر pnpm سيُنشئ `pnpm-lock.yaml`. راجع التغييرات الناتجة، ثم أضف ملف القفل إلى Git. بعد اعتماده، استخدم `corepack pnpm install --frozen-lockfile` في CI.

## أوامر التشغيل والفحص

```bash
corepack pnpm dev:web
corepack pnpm dev:api
corepack pnpm build:web
corepack pnpm build:api
corepack pnpm type-check:web
corepack pnpm type-check:api
corepack pnpm test:web
corepack pnpm test:api
```

يمكن تشغيل أوامر npm الحالية داخل كل تطبيق عند الحاجة:

```bash
cd apps/web && npm ci
cd ../api && npm ci
```

لا تشغّل أوامر تثبيت npm وpnpm في الوقت نفسه على نفس مجلدات `node_modules`. بعد اعتماد pnpm، يُفضّل توحيد CI تدريجيًا بدل تبديل مدير الحزم داخل جميع الوظائف دفعة واحدة.

## قبل النشر

لم يُثبت بعد أن البناء الكامل أو Playwright ينجحان بعد النقل. شغّل التحقق من المسارات، ثم بناء واختبارات الويب والـ API، ثم Smoke E2E وبناء Android/Cloudflare في بيئة CI. لا تنشر هذه المرحلة إلى الإنتاج قبل اجتياز هذه البوابات.
