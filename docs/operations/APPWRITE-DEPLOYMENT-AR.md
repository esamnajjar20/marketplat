# تشغيل API داخل Appwrite Functions (تجريبي)

## ما الذي تغير؟

- `apps/api/src/app.ts` كان يصدّر `app` بالفعل؛ لذلك لم نعدّل `server.ts` ولم نحذف `app.listen()` منه.
- `server.ts` هو مشغّل الخادم الدائم: يتصل بـ PostgreSQL وRedis، ويبدأ المؤقتات والـ subscribers والـ queue workers ويعالج SIGTERM. استيراده من Function سيشغّل bootstrap غير مناسب لبيئة الطلب الواحد.
- أضيف `src/appwrite-entry.ts` ليستورد `app` مباشرة من `src/app.ts` ويحوّل طلب Appwrite إلى حدث يفهمه `serverless-http`.
- أضيفت `serverless-http` إلى اعتماديات API وملف القفل.

## البناء والإعداد

اجعل مجلد مصدر Function هو `apps/api`، ونفّذ تثبيتًا نظيفًا من `apps/api/package-lock.json` ثم:

```bash
npm ci
npm run build
```

اضبط Entrypoint على:

```text
dist/appwrite-entry.js
```

يجب أن تكون نقطة الدخول مبنية إلى JavaScript؛ Node لا يشغّل ملف TypeScript مباشرة دون loader.

## متغيرات البيئة

انقل فقط متغيرات API المطلوبة فعليًا من إعدادات Render الحالية، ومنها بحسب تفعيل الميزات:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL` وأي Redis URLs منفصلة يطلبها `src/config/redis.ts`
- `JWT_SECRET` ومفاتيح التوقيع/التشفير المطلوبة في `src/config/env.ts`
- `FRONTEND_URL` وOrigins المسموحة
- إعدادات Cloudinary وSMTP وFCM وSentry عند استخدامها

لا تضع أسرارًا في مستودع Git. راجع `src/config/env.ts` و`.env.example` لتحديد القائمة الإلزامية الدقيقة؛ مخطط البيئة هو المرجع النهائي.

## قيود توافق مهمة قبل تحويل الإنتاج

1. هذه نقطة دخول HTTP وليست بديلًا عن `server.ts` كعملية دائمة. لن تبدأ تلقائيًا queue consumers أو outbox workers أو cache warmup أو Redis invalidation subscribers أو مؤقتات flush.
2. بعض المسارات تعتمد Redis وPostgreSQL. Prisma يتصل عند أول استخدام، لكن يجب التأكد من أن Redis clients تتصل عند الحاجة وأن cold start لا يتجاوز مهلة Appwrite.
3. لا تفترض أن SSE (`/notifications/stream`) مناسب لحدود Function أو مهلاتها؛ اختبره منفصلًا أو استمر بتقديمه من الاستضافة الدائمة.
4. Multer يستقبل multipart عبر Express adapter، لكن يجب اختبار رفع صور حقيقي بأحجام الملفات المعتمدة. لا يعني ذلك أن الملفات ستُحفظ في Appwrite Storage؛ كود Cloudinary الحالي يظل مسار التخزين ما لم يُطوّر تكامل منفصل.
5. راجع حدود حجم الطلب/الاستجابة والذاكرة والمهلة وحجم الحزمة في خطة Appwrite الفعلية قبل نشر كل المسارات.
6. لا توجّه الإنتاج إلى هذه Function قبل اختبارات auth/cookies/CORS/CSRF/multipart/Redis/Prisma وطلبات الكتابة وإعادة المحاولة. Functions قد تعيد المحاولة أو تنفذ بالتوازي؛ لا تجعل أي عملية كتابة غير idempotent.

## اختبار أولي

بعد النشر، اختبر بالترتيب:

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready` (يتطلب التبعيات)
- تسجيل الدخول ثم طلب محمي مع Cookie/Authorization
- CORS وCSRF من نطاق الواجهة الحقيقي
- رفع صورة صغيرة ثم صورة بالحجم الأقصى
- إنشاء/تعديل كيان مع فحص purge والكاش
- عمليات تتطلب Redis وعمليات outbox/notifications

أبقِ Render/Railway كخادم API الأساسي إلى أن تنجح هذه الاختبارات؛ يمكن استخدام Appwrite Function لتجربة محدودة أولًا.
