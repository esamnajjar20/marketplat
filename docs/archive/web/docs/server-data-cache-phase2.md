# المرحلة الثانية — Server Data Fetching وNext Data Cache

## ما الذي تغيّر؟

- توحيد قراءات Server Components في `lib/server/serverApiFetch.ts`.
- استخدام `API_WORKER` Service Binding في Cloudflare SSR بدلاً من طلب `workers.dev` من Worker آخر. عند غياب الـ Binding في Cloudflare يفشل الطلب بأمان ولا يعود إلى المسار المعروف بخطر Cloudflare 1042.
- استخدام `React.cache()` لمنع تكرار القراءة داخل دورة الطلب، و`unstable_cache()` لتخزين البيانات العامة بين الطلبات مع `revalidate` وTags.
- جعل التخزين العام Allowlist لمسارات عامة محددة فقط. أي Endpoint غير مسجل أو شخصي لا يمكنه اختيار وضع `public`؛ يجب استخدام `no-store`.
- إبقاء `/ads/:id` على `no-store` لأن قراءة التفاصيل لها أثر جانبي متعلق بتسجيل المشاهدة.
- التخزين المستمر لقوائم التصفح يقتصر على الصفحة الأولى الافتراضية غير المفلترة وبالترتيب القياسي. البحث الحر والمدينة والتصنيف والأسعار والحالة ونوع الخدمة والموقع ومعرّفات مقدمي الخدمة/البائعين وأي معامل غير معروف تبقى Server-rendered لكن `no-store`؛ وهذا يمنع تضخم Data Cache بمفتاح لكل تركيبة فلاتر.
- إضافة Route Handler داخلي لإبطال Tags/Paths بتوقيع HMAC-SHA256، والتحقق من الوقت وحجم الطلب والوسوم المسموحة.
- إضافة ربط في Express يلتقط تغييرات المحتوى العامة الناجحة فقط، ثم يرسل وسوم الإبطال عبر طابور purge الحالي مع coalescing وإعادة المحاولة.

## وسوم التخزين

الوسوم العامة تتضمن `api` كوسم شامل، ووسوماً حسب المجال مثل `route:ads` و`route:products` و`route:stores` و`route:service-listings` و`route:home`، إضافة إلى الوسم الشامل `api` لمعالجة تجاوز حد طابور الإبطال. تستعمل عمليات التعديل الناجحة الوسوم المطابقة لإبطال الإدخالات ذات الصلة.

تُستثنى العمليات الشخصية/التفاعلية مثل متابعة متجر وإدارة أعضاء المتجر من إبطال قوائم الكتالوج العامة. وتحوّل نقطة Next وسوم المدن القديمة الخاصة بإعلانات Worker إلى إبطال `route:ads` و`route:home`؛ لأن Cache الخادمي في هذه المرحلة يخزن القائمة العامة غير المقسمة حسب المدينة. كما تشمل الخريطة مسارات إشراف الإدارة (`/admin/ads` و`/admin/products` و`/admin/service-listings` و`/admin/fraud/ads`).

## إعداد الإنتاج

التغييرات البرمجية لا تفعّل Webhook تلقائياً. التفعيل اختياري وآمن افتراضياً، ويتطلب إعداد القيم التالية:

1. في Frontend Cloudflare Worker، أضف سراً عشوائياً لا يقل عن 32 حرفاً:

   ```bash
   cd frontend
   npx wrangler secret put NEXT_CACHE_REVALIDATION_SECRET
   ```

2. في خدمة Express API على Render، أضف:

   ```dotenv
   NEXT_CACHE_REVALIDATION_URL=https://<frontend-host>/api/internal/cache/revalidate
   NEXT_CACHE_REVALIDATION_SECRET=<same-secret-as-frontend>
   CF_CACHE_TAG_PURGE_ENABLED=true
   ```

3. احتفظ بإعدادات `EDGE_WORKER_PURGE_URL` و`EDGE_WORKER_PURGE_TOKEN` الحالية إذا كنت تريد الاستمرار في إبطال Cloudflare Worker Cache أيضاً. لا تحذفها ضمن هذه المرحلة.

4. انشر Frontend أولاً ثم إعدادات API. اختبر عملية تعديل عامة (مثلاً تعديل منتج أو إعلان) وتحقق من سجلات API أن Next.js Data Cache webhook قُبل. لا تضع السر في متغير `NEXT_PUBLIC_*` ولا في المستودع.

إذا لم تضبط URL والسر معاً، أو بقي `CF_CACHE_TAG_PURGE_ENABLED=false`، يبقى الإبطال التلقائي عبر Webhook معطلاً وتعمل مدد `revalidate` كحد احتياطي.

## حدود النطاق

هذه المرحلة توحّد Server API Fetching للقراءات الخادمية العامة المستخدمة حالياً (صفحات التصفح والتصنيفات والصفحة الرئيسية) وتبني مسار الإبطال. لا تحوّل كل استدعاءات Axios الحالية إلى Data Cache، ولا تخزّن بيانات الحساب/المحادثات/الطلبات الخاصة. نقل تفاصيل المنتجات والمتاجر والخدمات إلى سياسات Cache مستقلة يحتاج مراجعة أثر القراءة والصلاحيات في المرحلة التالية.
