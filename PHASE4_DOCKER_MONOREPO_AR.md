# المرحلة الرابعة — مواءمة Docker مع Monorepo

## الملفات المعدلة
- `.dockerignore` — جديد في جذر المستودع، لتقليل سياق البناء واستبعاد مجلدي `backend/` و`frontend/` القديمين المكررين.
- `apps/api/Dockerfile` — البناء من جذر Monorepo باستخدام pnpm والـ lockfile المركزي، مع فصل builder/production وتشغيل غير root.
- `apps/web/Dockerfile` — البناء من جذر Monorepo باستخدام pnpm والـ lockfile المركزي، مع الإبقاء على Next.js standalone وتشغيل غير root.
- `apps/api/docker-compose.yml` و`apps/api/docker-compose.full.yml` — تحديث build contexts إلى جذر المستودع وتحديد Dockerfile الصحيح صراحةً.
- `apps/api/package.json` و`pnpm-lock.yaml` — نقل `prisma` إلى dependencies لأن `docker-entrypoint.sh` يشغّل `prisma migrate deploy` في بيئة الإنتاج؛ وجود Prisma CLI ضمن devDependencies فقط يجعل صورة `--prod` غير قادرة على تنفيذ هذا الأمر بصورة موثوقة.

## طريقة البناء
من جذر المستودع:

```sh
docker build -f apps/api/Dockerfile -t marketplat-api:local .
docker build -f apps/web/Dockerfile -t marketplat-web:local .
```

تشغيل الخدمات من ملف Compose الموجود تحت `apps/api`:

```sh
cd apps/api
docker compose -f docker-compose.yml config
docker compose -f docker-compose.full.yml config
```

ثم بعد إعداد متغيرات البيئة المطلوبة، يمكن بناء وتشغيل المجموعة الكاملة باستخدام `docker compose -f docker-compose.full.yml up -d --build`.

## ما تم التحقق منه
- ملفات JSON صالحة نحويًا.
- ملفات YAML الخاصة بالـ workspace وCompose قابلة للتحليل.
- `pnpm-lock.yaml` يضع Prisma CLI ضمن dependencies للـ API وبالإصدار المقفل `5.22.0`.
- ملفات Compose تشير إلى جذر المستودع وإلى Dockerfiles الجديدة.

## حدود التحقق
لم يتوفر Docker/Podman أو pnpm في بيئة الفحص، لذلك **لم يتم تنفيذ Docker build أو `pnpm install --frozen-lockfile` فعليًا**. يلزم تشغيلها في بيئة تدعم Docker، والأفضل تشغيل تحقق المرحلة الثالثة من GitHub Actions أولًا للتأكد من توافق الـ lockfile قبل اعتماد الصور للإنتاج.

## ملاحظات تشغيلية
- هذه التعديلات تخص `apps/api` و`apps/web` في Monorepo؛ لم يتم تعديل Dockerfiles القديمة تحت `backend/` و`frontend/` لأنها نسخ مكررة لم يُحسم مصدرها النهائي.
- تم الإبقاء على ملفات Compose وقواعد البيانات وRedis كما هي عدا مسارات البناء، ولم يتم تغيير إعدادات الخدمات أو الأسرار.
- `NEXT_PUBLIC_*` قيم build-time في Next.js؛ يجب تمرير القيم الفعلية عند البناء، لا الاكتفاء بتغيير متغيرات وقت تشغيل الحاوية.
