# تفعيل كاش Next.js على Cloudflare

أضيفت تهيئة OpenNext التالية إلى `frontend/open-next.config.ts`:

- R2 Incremental Cache لتخزين بيانات Next.js بصورة دائمة.
- Durable Object Queue لإعادة التحقق الزمني ومنع تكرار مهام revalidation.
- Sharded Durable Object Tag Cache لدعم `revalidateTag` و`revalidatePath` المستخدمتين في App Router.

## خطوة مطلوبة قبل أول نشر

ملفات المشروع لا تستطيع إنشاء موارد Cloudflare في حسابك. يجب إنشاء حاوية R2 مرة واحدة باسم مطابق تمامًا للقيمة الموجودة في `frontend/wrangler.jsonc`:

```bash
cd frontend
npx wrangler r2 bucket create marketplat-next-cache
```

ثم تحقق من إعدادات حساب Cloudflare وصلاحيات النشر، وبعدها شغّل:

```bash
npm run cloudflare:cache-audit
npm run build:cf
```

ونفّذ النشر بالطريقة المعتادة للمشروع. لا تنفذ `wrangler deploy` قبل إنشاء حاوية R2 والتأكد من أن حساب Cloudflare يسمح بـ Durable Objects وSQLite-backed Durable Objects.

## ملاحظات تشغيلية

- أُبقي `WORKER_SELF_REFERENCE` و`API_WORKER` كما هما؛ فهما مستخدمان بالفعل في بنية المشروع.
- أُضيفت هجرة Durable Objects بالوسم `v1` لأن ملف Wrangler الأصلي لم يكن يحتوي على هجرات. إذا كان Worker منشورًا سابقًا مع هجرات Durable Objects غير موجودة في هذا الأرشيف، يجب دمج هذه الفئات مع سجل الهجرات المنشور وعدم إعادة استخدام الوسم `v1`.
- لم يُفعّل Regional Cache أو Cache Purge تلقائيًا. Regional Cache يستخدم Cache API، وOn-Demand invalidation يتطلب ضبط purge على Zone مخصصة وبيانات اعتماد مناسبة. تركه معطّلًا يتجنب تقديم بيانات قديمة قبل تجهيز ذلك الربط.
- لا يضيف هذا التغيير أي مفاتيح سرية أو `NEXT_PUBLIC_*`، ولا يغيّر سياسة تخزين بيانات المستخدمين الخاصة.
- فحص CI الجديد يتحقق من تطابق إعدادات الملفات والعقود البرمجية، لكنه لا يثبت وجود R2 فعليًا في حساب Cloudflare؛ ذلك يتطلب تحققًا من بيئة النشر.
