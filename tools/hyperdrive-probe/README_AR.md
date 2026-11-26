# مسبار Hyperdrive التجريبي لـ MarketPlat

هذا Worker مستقل للمرحلة الأولى فقط. هدفه إثبات أن Cloudflare Hyperdrive يستطيع الوصول إلى PostgreSQL في Aiven وإدارة اتصالات المصدر، قبل نقل أي طلب إنتاجي من Express.

## حدود التنفيذ الحالية

- لا يغيّر `DATABASE_URL` في Express أو Go.
- لا يربط Worker مع API Gateway ولا يغيّر مسارات الإنتاج.
- لا يستخدم Prisma بعد؛ نسخة API الحالية في المستودع تستخدم Prisma 5.22 وعميل المحرك الاعتيادي. نؤجل Prisma-on-Workers إلى قرار توافق مستقل بدلاً من ترقية Prisma الأساسية أو تعديل schema ضمن تجربة الاتصال.
- ينفذ `SELECT 1::int AS ok` فقط؛ لا توجد كتابة أو قراءة بيانات مستخدمين.
- ينشئ `pg.Client` جديداً لكل طلب وينهيه في `finally`. لا يوجد `Pool` أو اتصال على مستوى الوحدة؛ Hyperdrive هو الذي يحتفظ بتجمع اتصالات المصدر.
- نقطة فحص قاعدة البيانات محمية بـ Bearer token سري. `/health` لا يتصل بقاعدة البيانات.
- Query caching معطل في Hyperdrive لهذه التجربة.

## 1. تثبيت حزم العامل

من هذا المجلد:

```bash
npm install
npm run check
```

يتطلب Node.js `>=22.18 <25`.

## 2. إنشاء Hyperdrive من لوحة Cloudflare

أنشئ إعداداً جديداً باسم `marketplat-aiven-probe`:

1. اختر PostgreSQL وأدخل بيانات الاتصال الخاصة بخدمة Aiven.
2. استخدم TLS. يفضّل `verify-full` مع شهادة CA الصحيحة إن كانت متاحة ومدعومة في إعداد Aiven؛ لا تخفّض التحقق من الشهادة لمجرد تجاوز مشكلة اتصال.
3. عطّل Query Caching في التجربة الأولى.
4. اضبط Origin connection limit على **5** كبداية محافظة. هذا حد أدنى مدعوم، وهو حد مرن وليس سقفاً صارماً أثناء حالات استعادة الاتصال.
5. احفظ الإعداد وانسخ Hyperdrive ID.

لا تضع connection string أو كلمة مرور Aiven في ملفات المستودع أو في محادثة. لوحة Cloudflare هي المسار المفضل لإدخالها.

إذا كانت قاعدة Aiven تستخدم IP allowlist، اسمح بنطاقات عناوين Cloudflare الرسمية المستخدمة من Hyperdrive فقط، ولا تفتح قاعدة البيانات لكل الإنترنت. راجع مرجع الشبكات: https://developers.cloudflare.com/hyperdrive/configuration/firewall-and-networking-configuration/

## 3. إضافة Binding

بعد إنشاء Hyperdrive، أضف الـ ID إلى `wrangler.jsonc`:

```jsonc
"hyperdrive": [
  {
    "binding": "HYPERDRIVE",
    "id": "PASTE_HYPERDRIVE_ID_HERE"
  }
]
```

استبدل القيمة بالـ ID الحقيقي. لا تضف connection string إلى هذا الملف.

## 4. إعداد رمز الفحص السري

أنشئ رمزاً عشوائياً لا يقل عن 32 محرفاً، ثم خزّنه كـ Worker Secret:

```bash
openssl rand -hex 32
npx wrangler secret put HYPERDRIVE_PROBE_TOKEN
```

الصق الناتج في موجه Wrangler السري. لا تضفه إلى `vars` أو `wrangler.jsonc` أو Git.

## 5. التشغيل والنشر

```bash
npm run check
npm run deploy
```

اختبر health:

```bash
curl https://<WORKER_SUBDOMAIN>.workers.dev/health
```

اختبر قاعدة البيانات من جهاز موثوق يحتفظ بالرمز في متغير بيئة:

```bash
curl -X POST \
  -H "Authorization: Bearer $HYPERDRIVE_PROBE_TOKEN" \
  https://<WORKER_SUBDOMAIN>.workers.dev/__internal/db-probe
```

استجابة النجاح لا تكشف اسم قاعدة البيانات أو المضيف أو معلومات الجداول؛ تعرض فقط نجاح `SELECT 1` وزمن الاستعلام. أخطاء الاتصال ترجع `DATABASE_UNAVAILABLE` دون تفاصيل حساسة.

## 6. بوابة قبول المرحلة الأولى

لا نربط API Gateway ولا نحوّل أي مسار إنتاجي حتى تتحقق جميع النقاط التالية:

- `GET /health` يعيد 200.
- الطلب غير المصرّح به إلى `POST /__internal/db-probe` يعيد 401 ولا يفتح اتصالاً.
- الطلب المصرّح به يعيد 200 و`database: reachable`.
- Aiven يبيّن الاتصالات الواردة من Hyperdrive ضمن الحد المتوقع.
- لا توجد أسرار في logs أو Worker response أو Git.
- يعاد الاختبار بعد restart/تحديث إعداد Hyperdrive للتأكد من الاستقرار.

## المرحلة الثانية: قياس الأداء والتزامن

بعد نجاح الاتصال الفعلي، استخدم `PHASE2-BENCHMARK-AR.md` لتشغيل اختبار HTTP محدود ومتدرج. الأداة الافتراضية تختبر مستويات تزامن 1 و2 و5، وتنفذ `SELECT 1` فقط دون أي كتابة. تسجل زمن HTTP وزمن `connect` وزمن الاستعلام والمئينات ومعدل الأخطاء في تقرير JSON محلي داخل `reports/`.

قبل التشغيل:

```bash
npm ci
npm run check
npm run deploy
export HYPERDRIVE_PROBE_URL='https://<worker-subdomain>.workers.dev/__internal/db-probe'
export HYPERDRIVE_PROBE_TOKEN='ضع-الرمز-محلياً-في-بيئة-الطرفية'
npm run benchmark
unset HYPERDRIVE_PROBE_TOKEN HYPERDRIVE_PROBE_URL
```

لا ترفع حدود التزامن قبل مراجعة نتائج التشغيل الافتراضي ومؤشرات الاتصالات في Aiven. هذه الأداة لا تقارن الاتصال المباشر بـ Hyperdrive ولا تثبت تحسن أداء خدمات Express/Go الإنتاجية.

التفاصيل: [`PHASE2-BENCHMARK-AR.md`](./PHASE2-BENCHMARK-AR.md).

## لماذا لا يوجد Prisma هنا؟

نسخة `apps/api` في المستودع تستخدم `prisma` و`@prisma/client` بإصدار 5.22.0 ومولّد `prisma-client-js` مع محرك الاعتيادي. توثيق Prisma الحالي يوصي لمسار Worker الخالي من محرك Rust باستخدام `engineType = "client"` وDriver Adapter، ويذكر أن هذا المسار أصبح GA ابتداءً من Prisma 6.16. لذلك لا نعيد استخدام Client الحالي في Worker ولا نرقّي Prisma على مستوى المستودع ضمن اختبار الاتصالات. بعد نجاح المسبار نقرر ترقية محكومة أو فصل طبقة DB Worker/adapter بخطة واختبارات مستقلة.

## التراجع

هذا العامل مستقل ولا يغيّر Express أو Go. لإيقاف التجربة: أوقف نشر `marketplat-hyperdrive-probe` أو احذف Worker وHyperdrive التجريبي من لوحة Cloudflare. لا تحذف أي مورد إنتاجي أو قاعدة بيانات.
