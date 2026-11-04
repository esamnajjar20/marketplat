# تقرير إصلاح التدقيق المعماري والأمني المخفي — MarketPlat

**النسخة المرجعية:** `marketplat-main.zip` المرفوعة في هذه المحادثة  
**النطاق:** Next.js 15 App Router / OpenNext / Cloudflare Worker / Express API / Prisma / Service Worker / Offline Queue  
**النتيجة:** طُبّقت إصلاحات المشكلات القابلة للإصلاح من تدقيق المصدر، وأضيفت حواجز انحدار. لم يُدّعَ نجاح build أو type-check كامل لأن الاعتماديات وأدوات البناء غير متاحة في بيئة التنفيذ.

---

## 1) SSRF في وسيط وسائط المحادثات — خطورة عالية — تم الإصلاح

**الموضع:**
- `apps/api/src/modules/conversations/conversations.controller.ts`
- `apps/api/src/modules/conversations/cloudinaryMediaUrl.ts` (جديد)
- `apps/api/tests/unit/cloudinaryMediaUrl.test.ts` (جديد)

**المشكلة:** كان Endpoint وسائط المحادثة يجلب `asset.url` مع `redirect: 'follow'` ثم يحمّل كامل الملف في الذاكرة بواسطة `arrayBuffer()`. فحص رابط Cloudinary واسع أو غير حاسم لا يكفي إذا أمكن التحويل إلى مضيف آخر، كما أن حجم الاستجابة لم يكن محددًا عند البث.

**الإصلاح:**
- إضافة `parseTrustedCloudinaryMediaUrl()` لقبول HTTPS على المضيف المطابق تمامًا `res.cloudinary.com`، واسم Cloudinary المهيأ في الخادم، وأنواع/طرق التسليم المسموحة فقط.
- رفض المنافذ والاعتمادات وQuery وHash والمسارات غير القياسية.
- تغيير سياسة التحويل إلى `redirect: 'error'`.
- تحديد مهلة 12 ثانية، ورفض Content-Length الأكبر من 15MB، وفرض الحد نفسه على عدد البايتات أثناء القراءة.
- بث `ReadableStream` تدريجيًا إلى الاستجابة مع احترام back-pressure بدل تجميع الملف كله في الذاكرة.
- إرسال `X-Content-Type-Options: nosniff` و`Cache-Control: private, no-store`، وتثبيت اسم الملف في `Content-Disposition` وترميزه وفق RFC 5987.

**ملاحظة:** هذا المسار داخل Express/Node، وليس داخل Cloudflare Middleware. الاختبار الديناميكي للمساعد قبل الحزمة قبل 3 روابط صحيحة ورفض 11 رابطًا خبيثًا/غير قياسي.

## 2) توافق Edge Runtime وServer Actions وسياق الطلب — لا يوجد خلل مؤكد يحتاج تغييرًا

**المواضع التي تمت مراجعتها:**
- `frontend/middleware.ts`
- وحدات `frontend/lib` المستوردة من مسار Middleware
- Server-side QueryClient و`React.cache()` ضمن تطبيق Next

**النتيجة:**
- لم يُعثر على توجيه `'use server'` إنتاجي في تطبيق الواجهة؛ لذا لا توجد Server Actions حالية يمكن أن تلوّث نطاق Cache عبر `cookies()` أو `headers()`.
- لا يظهر استيراد Node APIs أصلية من مسار Middleware الحالي. ظهور `node:fs` و`node:path` في نتائج البحث يخص سكربتات التدقيق والاختبارات وأدوات التطوير، وليس Middleware runtime.
- QueryClient على الخادم معزول لكل طلب، واستخدام `React.cache()` هنا لا ينشئ Cache عالميًا مشتركًا بين المستخدمين.

لم أضف Polyfills أو أغيّر Runtime دون حاجة، لأن ذلك قد يضيف وزنًا أو يخفي اعتمادًا غير متوافق بدل إصلاحه.

## 3) Blob URLs وإدارة الملفات والذاكرة — خطورة متوسطة/عالية — تم الإصلاح

**المواضع:**
- `frontend/hooks/useObjectUrl.ts` (جديد)
- `frontend/components/ads/AdFormPreview.tsx`
- `frontend/components/stores/ProductFormPreview.tsx`
- `frontend/components/services/ServiceListingFormPreview.tsx`
- `frontend/components/settings/SyncCenterClient.tsx`
- `frontend/components/shared/forms/ImageUpload.tsx`
- `frontend/components/messages/MessageMediaGallery.tsx`
- `frontend/components/messages/MessageMedia.tsx`
- `frontend/components/messages/MessageInput.tsx`

**المشكلات والإصلاحات:**
- نقل إنشاء Object URLs من render/`useMemo` إلى Effects أو أحداث تفاعلية.
- إضافة `URL.revokeObjectURL()` عند تغيير Blob أو حذف العنصر أو إغلاق المكوّن أو إلغاء معاينة PDF أو unmount.
- منع عرض URL قديم تم إلغاؤه خلال الانتقال إلى Blob جديد عبر مطابقة هوية Blob في `useObjectUrl`.
- منع إكمال قراءة PDF متأخرة من إنشاء URL بعد إغلاق المعاينة أو إزالة المكوّن.
- إصلاح ترتيب Hooks في `MessageMediaGallery` بحيث تسبق جميع Hooks شروط الإرجاع.
- إصلاح سباق إذن الميكروفون: إذا وصل إذن `getUserMedia()` بعد مغادرة الصفحة أو تغيير المحادثة، تُوقف كل MediaStream Tracks ولا يبدأ التسجيل. تمت معالجة مؤقت التسجيل وBlob preview كذلك.

## 4) IndexedDB وتخزين وسائط المحادثة — خطورة متوسطة — تم الإصلاح

**الموضع:** `frontend/lib/conversationMediaStore.ts`

- تغليف التعامل مع قاعدة البيانات في `withDatabase()` وإغلاق الاتصال في `finally`.
- إغلاق الاتصال عند `versionchange`، وكذلك إغلاق أي اتصال يصل بعد فشل فتح محجوب.
- إصلاح حساب LRU بحيث لا يخصم السجل نفسه مرتين.
- تحديد حجم Blob المخزن عند 12MB، وحد المحادثة 30MB، وحد المستخدم 80MB، وعدد عناصر التخزين التلقائي 15، والتزامن 3، ومدة صلاحية 30 يومًا.
- فرض مهلة 12 ثانية وحد حجم أثناء القراءة بالبث، وعدم إرسال Cookies الخاصة بالموقع عند طلب Cloudinary المباشر (`credentials: 'omit'`). يبقى طلب Proxy المحلي الموثّق مع Credentials.
- عند فتح `MessageMediaGallery`، يقرأ المعرض IndexedDB فقط ولا يبدأ Backfill جماعيًا؛ عملية Backfill محدودة تنطلق عند جلب بيانات الوسائط في `useConversationMedia`، وإعادة المحاولة الفردية لا تحدث إلا عند فشل عنصر أثناء الاتصال.

## 5) Offline Queue وRace Conditions وترتيب الرسائل — خطورة عالية — تم الإصلاح

**المواضع:**
- `frontend/public/sw.js`
- `frontend/hooks/mutations/useConversationMutations.ts`
- `frontend/lib/conversationMediaStore.ts`
- `apps/api/src/modules/conversations/conversations.service.ts`

**Service Worker / Queue:**
- منع إضافة العملية نفسها مرتين داخل معاملة IndexedDB واحدة عند تكرار `operationId`.
- فرض قفل `processing` عبر معاملة `readwrite` ذرية: قراءة السجل والتحقق من الـlease وكتابته تتم ضمن معاملة واحدة.
- إضافة Lease ID ومدة صلاحية محدودة واستعادة السجلات القديمة/المنتهية ذريًا، مع تحرير القفل فقط من مالكه.
- جعل الترتيب خاصًا بكل `conversationId` بدل أن توقف رسالة قديمة في محادثة واحدة كل محادثات المستخدم.
- تحديد مهلة 15 ثانية لطلب Replay.
- الإبقاء على عزل مالك العملية وعدم حفظ Bearer token في Queue.

**إرسال الرسائل المتزامن وSSE:**
- إصلاح Redis pending state: لا يُبتلع خطأ `OFFLINE_OPERATION_IN_FLIGHT` داخل catch الخاص بأعطال Redis. يبقى PostgreSQL القيد النهائي للـidempotency.
- عند فشل Mutation متفائلة، تُحذف الرسالة المتفائلة الخاصة بها فقط بدل استعادة Snapshot كامل قد يمحو تحديث SSE أو قراءة أحدث.
- حماية معاينة المحادثة من استجابة قديمة تصل بعد استجابة أحدث أو بعد رسالة SSE أحدث.
- إدراج الرسائل المؤكدة بترتيب `createdAt` بدل ترتيب وصول HTTP responses.

## 6) ذاكرة رفع ملفات المحادثة — خطورة متوسطة/عالية — تم الإصلاح جزئيًا بحسب نطاق الخدمة

**الموضع:** `apps/api/src/middlewares/upload.middleware.ts`

- بقي حد الملف كما هو: 8MB للصوت و15MB للملفات.
- أضيف سقف ثلاث عمليات Upload متزامنة للوسائط الصوتية وملفات الرسائل داخل عملية API الواحدة.
- يُحجز المقعد قبل Multer ويُحرر مرة واحدة عند `finish` أو `close`، أي يبقى الحجز خلال رفع Cloudinary/المعالجة اللاحقة لا خلال قراءة multipart فقط.

**قيد مهم:** هذا الحد process-local. إذا شُغّلت عدة عمليات API أو عدة replicas فسيتضاعف الإجمالي النظري بعددها. الحد العالمي عبر كل النسخ يحتاج Redis semaphore موزعًا أو نقل الرفع إلى object storage streaming. لا أدّعي أن القيد الحالي عالمي.

## 7) Stack Traces والأخطاء الداخلية — لا يوجد تسريب استجابة مؤكد

**الموضع:** `apps/api/src/middlewares/error.middleware.ts`

توجد Stack Traces في سجلات الخادم/مزود الرصد فقط. استجابات 500 تستخدم رسائل عامة مثل `Internal server error` ولا تُرجع `err.stack` أو رسائل Prisma الداخلية إلى العميل. أبقيت السلوك كما هو ولم أحذف الرصد التشغيلي.

## 8) Cloudflare CPU وحجم Bundle والعمليات الثقيلة — لا يوجد خرق مثبت، والقياس النهائي غير متاح

**النطاق:** `frontend` وOpenNext/Cloudflare Worker وملفات API المنفصلة.

- لم يظهر في مسار Middleware/Worker استدعاء OCR/PDF أو معالجة صور ثقيلة تعمل على كل طلب.
- عمليات Multer memoryStorage المذكورة أعلاه تخص خدمة Express/Node، وليست CPU الخاصة بـCloudflare Worker.
- لم يمكن قياس حجم Bundle غير المضغوط أو CPU الفعلي دون `opennextjs-cloudflare build` ونشر Preview؛ لذلك لا أضع أرقامًا تقديرية غير مقاسة.

## 9) تصحيح أدوات Workspace وDocker/CI التي كشفتها جولة الإصلاح

**المواضع:**
- `package.json` و`tooling/dev-all.mjs`
- `tooling/verify-workspace.mjs`
- `apps/api/docker-compose.full.yml`
- `apps/api/Dockerfile`
- `frontend/Dockerfile` و`frontend/.dockerignore`
- `.github/workflows/*.yml`
- `tools/check-error-contract.mjs`

تم تثبيت الفصل الفعلي: Next في `frontend/` يستخدم npm مستقلًا، وبقية monorepo (`apps/api` وmobile والحزم والـWorker) تستخدم pnpm. أُصلحت أوامر الجذر التي كانت تبحث عن `apps/web`، وأُصلحت سياقات Docker: API يبني من الجذر عبر `apps/api/Dockerfile`، والواجهة تبني من `frontend/` مع إبقاء `package-lock.json` ضمن Docker context. تم تصحيح مصفوفة Docker في CI ومراجع workflows القديمة وإضافة حارس Workspace.

---

# نتائج التحقق بعد آخر تعديل

| الفحص | النتيجة |
|---|---:|
| `hidden-architecture-fixes-audit.mjs` | 22/22 |
| `hydration-regression-audit.mjs` | 16/16 |
| `render-regression-audit.mjs` | PASS |
| `server-prefetch-audit.mjs` | 6/6 |
| `gateway-proxy-audit.mjs` | 8/8 |
| `offline-idb-connection-audit.mjs` | 21/21 |
| `offline-phase5-queue-audit.mjs` | 11/11 |
| `offline-phase8-idempotency-scope-audit.mjs` | 13/13 |
| `mutation-rollback-concurrency-audit.mjs` | 9/9 |
| `session-queue-lifecycle-fence-audit.mjs` | 8/8 |
| `session-queue-owner-isolation-audit.mjs` | 10/10 |
| `offline-queue-resilience-audit.mjs` | 11/11 |
| `offline-idempotency-contract-audit.mjs` | PASS |
| `sw-lifecycle-resilience-audit.mjs` | 11/11 |
| `sw-storage-pressure-audit.mjs` | 8/8 |
| `sw-update-safety-audit.mjs` | 9/9 |
| `offline-all-operations-audit.mjs` | 14/14 |
| Offline phases 3/4/6/7/8/9 and UX audits | PASS (كلها) |
| Offline phase 1 unit tests | 4/4 |
| Workspace structure | PASS |
| Backend/frontend error contract | 262 codes متطابقة ومترجمة |
| GitHub Workflow وCompose YAML | 32/32 |
| Docker Compose build contexts | API وWeb paths PASS |
| TypeScript/TSX syntax transpilation | 28 ملفًا، 0 أخطاء صياغة |
| `public/sw.js` وملفات tooling المعدلة | `node --check` PASS |
| Cloudinary URL runtime cases | 3 صحيحة مقبولة، 11 غير صحيحة مرفوضة |

## ما لم يمكن تنفيذه في هذه البيئة

- مجلدات `node_modules` غير موجودة؛ لذلك لم يُنفذ `tsc --noEmit` كاملًا ولا `next build` ولا OpenNext Cloudflare build ولا Vitest/Jest.
- Docker CLI غير متاح؛ تحققنا من YAML ومسارات سياقات البناء ووجود Dockerfiles فقط، ولم نبنِ صورة فعلية.
- لم تُنفذ اختبارات متصفح حقيقية أو اختبار SSRF حي ضد الشبكة؛ اختبارات المصدر والحارس ليست بديلًا عنها.
- نتيجة TypeScript أعلاه هي فحص syntax عبر TypeScript transpiler للملفات المعدلة، وليست فحص أنواع كاملًا.

**قرار التسليم:** الإصلاحات المصدرية والحواجز المناظرة موجودة في هذه النسخة. قبل نشر الإنتاج، يجب تشغيل تثبيت الاعتماديات وفحوص TypeScript/Next/OpenNext وDocker وBrowser E2E في CI أو بيئة المشروع. كما يجب أخذ حد رفع الوسائط process-local بالحسبان عند زيادة عدد عمليات/نسخ API.
