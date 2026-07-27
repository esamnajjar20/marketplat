# تشغيل الـ Backend على Android عبر Termux + proot Ubuntu

هذا الدليل يشرح تشغيل الـ backend مباشرة على جهاز أندرويد (ARM64) عبر
Termux و proot-distro Ubuntu، مع PostgreSQL و Redis حقيقيين (بدون Docker
— Docker غير مدعوم أصلًا داخل Termux لأنه يحتاج kernel namespaces غير
متوفرة على أندرويد العادي).

## 1. تجهيز Termux

```bash
pkg update && pkg upgrade -y
pkg install -y proot-distro git
proot-distro install ubuntu
proot-distro login ubuntu
```

كل الأوامر بعد هذه النقطة تُنفَّذ **داخل** بيئة الـ proot (بعد
`proot-distro login ubuntu`)، وليس في Termux مباشرة.

## 2. تثبيت Node.js داخل الـ proot

المشروع يتطلب Node `>=20 <25` (محدد في `package.json`). استخدم NodeSource
أو `nvm` — لا تستخدم حزمة `nodejs` القديمة من `apt` الافتراضية لأنها غالبًا
إصدار قديم جدًا:

```bash
apt update && apt install -y curl build-essential
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # تأكد أنه v20.x أو أحدث (وأقل من 25)
```

## 3. تثبيت وتشغيل PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
service postgresql start
su - postgres -c "psql -c \"ALTER USER postgres PASSWORD 'postgres';\""
su - postgres -c "createdb classifieds_db"
```

ملاحظة: داخل proot لا يوجد systemd، لذا `service postgresql start` (وليس
`systemctl`) هو الأمر الصحيح — ويجب تشغيله يدويًا في كل مرة تُعاد فيها
تشغيل بيئة الـ proot (لا يبدأ تلقائيًا مع إقلاع الجهاز).

## 4. تثبيت وتشغيل Redis

```bash
apt install -y redis-server
redis-server --daemonize yes
redis-cli ping   # يجب أن يرجع PONG
```

## 5. جلب المشروع وتثبيت الاعتماديات

```bash
cd ~
git clone <your-repo-url> marketplace
cd marketplace/backend
npm install
```

## 6. إعداد ملف البيئة

```bash
cp .env.termux.example .env
```

عدّل `JWT_SECRET` و `JWT_REFRESH_SECRET` في `.env` بقيم عشوائية حقيقية
(64+ حرف)، يمكن توليدها بـ:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 7. توليد Prisma Client وتشغيل الـ migrations

`schema.prisma` في هذا المشروع يحدد `binaryTargets` صراحة ليشمل
`linux-arm64-openssl-3.0.x` (افتراضي Ubuntu 22.04+ داخل proot-distro) و
`linux-arm64-openssl-1.1.x` (لصور proot أقدم) — هذا يحل مشكلة شائعة حيث
يفشل اكتشاف Prisma التلقائي للمنصة داخل بيئة الـ proot المعزولة (proot
يعترض بعض استدعاءات النظام التي يعتمد عليها هذا الاكتشاف).

```bash
npx prisma generate
npx prisma migrate deploy
```

إذا ظهر خطأ متعلق بعدم توفر engine binary مطابق، تأكد من إصدار Ubuntu
داخل الـ proot (`cat /etc/os-release`) وأن `binaryTargets` في
`prisma/schema.prisma` يغطي إصدار OpenSSL المطابق (`openssl version`).

**ملاحظة مهمة عند تغيير `binaryTargets`:** إن عدّلت `binaryTargets` بعد
تشغيل `prisma generate` مرة سابقة، احذف الملفات المولّدة القديمة أولًا
قبل إعادة التوليد — أحيانًا يبقى الـ engine binary القديم مخزّنًا محليًا
ولا يُستبدل تلقائيًا:

```bash
rm -rf node_modules/.prisma
npx prisma generate
```

## 8. تشغيل الخادم

```bash
npm run dev
```

الخادم الآن يحاول الاتصال بـ Postgres و Redis عدة مرات مع فاصل زمني قصير
قبل الفشل النهائي (انظر `withRetry` في `src/server.ts`) — هذا مخصص بالضبط
لهذا السيناريو: إن شغّلت `npm run dev` قبل أن يكتمل إقلاع Postgres/Redis
بلحظة، لن ينهار الخادم فورًا كما كان يحدث سابقًا.

## 9. تشغيل الاختبارات (اختياري لكن مهم — قاعدة بيانات منفصلة)

⚠️ **لا تشغّل الاختبارات بدون هذه الخطوة** — `tests/setup.ts` يحذف بيانات
جداول `User`, `Ad`, `Category` وغيرها بعد كل اختبار واحد. إن أشرت
`DATABASE_URL` لنفس قاعدة بيانات التطوير، ستفقد بياناتك المحلية بأول
تشغيل لـ `npm test`.

```bash
su - postgres -c "createdb classifieds_db_test"
cp .env.test.termux.example .env.test
npm test
```

سكربتات `test`/`test:watch`/`test:coverage` تضبط `NODE_ENV=test` تلقائيًا،
وهذا يجعل `src/config/env.ts` يحمّل `.env.test` (بدل `.env` العادي) —
راجع `.env.test.termux.example` للتفاصيل.

## ملاحظات ونصائح عملية

- **لا يوجد PM2 cluster mode مفيد هنا** — جهاز واحد بمعالج محدود الأنوية
  فعليًا يجعل `pm2 start ecosystem.config.js` (وضع cluster) غير ذي جدوى؛
  استخدم `npm run dev` أو `npm start` مباشرة.
- **لا يوجد Docker** — تجاهل `docker-compose*.yml` بالكامل على Termux؛
  هذه الملفات لبيئات خادم حقيقية فقط.
- **إعادة تشغيل الجهاز/تطبيق Termux** تُنهي عمليات Postgres و Redis —
  كرّر الخطوتين 3 و4 (التشغيل فقط، لا التثبيت) في كل جلسة جديدة. يمكن
  تبسيط هذا بسكربت صغير:
  ```bash
  #!/bin/bash
  service postgresql start
  redis-server --daemonize yes
  ```
- **البطارية/الأداء**: `REDIS_MAXMEMORY`, `MAX_ADS_PER_USER`, وكل إعدادات
  الـ backup في `.env.example` غير ذات صلة هنا وتُركت فارغة عمدًا في
  `.env.termux.example` — لا حاجة لضبطها لتشغيل محلي على الجهاز.
