# MarketPlat — المرحلة الثالثة: بوابة تحقق الـ Workspace على CI

## الهدف

إضافة workflow مستقل يختبر قابلية تثبيت الـ monorepo باستخدام إصدار pnpm المحدد في المشروع، قبل نقل جميع workflows القديمة أو تعديل Dockerfiles. هذه مرحلة انتقالية مقصودة وليست إعلانًا بأن CI/CD كله أصبح migrated.

## الملف الجديد

- `.github/workflows/workspace-foundation-validation.yml`
  - يثبت `pnpm@10.18.0` على GitHub Actions/Linux.
  - يشغّل `pnpm install --frozen-lockfile` دون تحديث lockfile.
  - يشغّل `verify:workspace` ويتأكد من أن Turbo قابل للتشغيل.
  - يعاين مخططات مهام Turbo بـ `--dry` دون تشغيل build/test/lint لتطبيقي الويب والـ API.
  - ينفّذ type-check والاختبارات الموجودة فعليًا في `packages/contracts` و`apps/mobile`.
  - يبدأ يدويًا عبر `workflow_dispatch` فقط؛ لا يغيّر سياسة CI الحالية ولا يفعّل استهلاك Actions تلقائيًا على كل push.

## نتائج التدقيق الساكن التي تحدد نطاق المرحلة

- ما زالت workflows متعددة تستخدم `npm ci` وملفات `package-lock.json` المحلية، منها `ci.yml`, `smoke-e2e.yml`, `cron.yml`, `sales-notifications.yml`, `knip.yml`, `audit.yml` و`build-apk.yml`.
- `osv-scanner.yml` يفحص ملفات قفل npm المحلية.
- `apps/web/Dockerfile` و`apps/api/Dockerfile` ما زالا مبنيين على تثبيت npm داخل سياق التطبيق.
- يوجد Worker في `workers/cf-api-proxy` دون `package.json`، ويُختبر حاليًا بأمر Node مباشر.

لذلك لم تُحذف ملفات `package-lock.json` ولم تُغيّر workflows الإنتاجية أو Dockerfiles في هذه المرحلة. نقلها دفعة واحدة قبل نجاح التثبيت المجمد سيجعل سبب الفشل أصعب في العزل.

## ما لم يتم تغييره عمدًا

- لم تُنقل Prisma schema أو migrations إلى `packages/db`؛ مرحلة مصدر الحقيقة الأولى لم تُغلق بعد، وفي `apps/api` ميزة `AdImageOfflineOperation` تحتاج اختبارات قاعدة بيانات وتزامن.
- لم تُدمج `frontend/` مع `apps/web/` أو `backend/` مع `apps/api/`، ولم تُحذف أي شجرة قديمة.
- لم تُغيّر إصدارات Node أو pnpm، ولم تُشغّل migration على قاعدة بيانات حقيقية.

## بوابة القبول

يُعدّ هذا المرشح ناجحًا فقط بعد تشغيل workflow على GitHub واجتياز جميع الخطوات. لم تُنفّذ بيئة الفحص الحالية `pnpm install --frozen-lockfile` أو build/test كاملين؛ إنشاء الملف والتحقق النحوي منه لا يثبتان نجاح التشغيل على CI.

## الخطوة التالية بعد نجاح البوابة

ترحيل workflows المساندة تدريجيًا إلى تثبيت الجذر باستخدام pnpm، ثم تحديث Docker build contexts بصورة مستقلة، مع إبقاء ملفات القفل القديمة حتى تصبح جميع المراجع إليها غير مطلوبة ويُثبت ذلك عمليًا.
