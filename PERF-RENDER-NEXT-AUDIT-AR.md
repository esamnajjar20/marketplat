# تقرير تدقيق إعادة التصيير وميزات Next.js غير المستغلة — MarketPlat

**تاريخ التدقيق:** 4 نوفمبر 2026  
**النطاق:** `frontend/` — تطبيق Next.js App Router مع React 19 وTanStack Query، والـAPI الأساسي منفصل على Express.  
**نوع التدقيق:** قراءة ساكنة للكود + تشغيل سكربتات الحماية الموجودة في المشروع + فحص صياغة TSX للملفات المعدّلة. لم يتم تشغيل التطبيق في متصفح أو React DevTools Profiler.

---

## 1. ملخص تنفيذي

تم العثور على أسباب فعلية لإعادة التصيير أو إعادة الحساب خارج الجزء الذي تغيّر، وتم إصلاحها في هذه الجولة:

1. تحديث مؤشر «يكتب الآن…» كان يعيد تصيير `ChatWindow`، وهو الأب الذي يحتوي الرسائل والمرفقات وأدوات المحادثة. نُقل الاشتراك والحالة والمؤقت إلى `ConversationTypingIndicator` مستقل ومحدود بالـconversation ID.
2. اختيار صورة أو التنقل بين صور الإعلان والمنتج والخدمة كان يحدّث state في مكوّن التفاصيل الأب؛ نُقلت حالة المعرض والـlightbox والإيماءات إلى ثلاثة مكوّنات فرعية memoized.
3. صفحة الإشعارات كانت تنشئ `filteredByRead` جديدة في كل تصيير، وبذلك تُبطل `groups` memo حتى عند فتح مربع حذف الإشعارات فقط. أصبحت الفلترة memoized، وانتقلت حالة مربع حذف المقروء وحالة mutation إلى مكوّن مستقل.
4. `MessageMediaGallery` كان يعيد حساب عدد الصور والصوت والملفات عند كل تبديل تبويب أو معاينة؛ أصبحت العدادات والتبويبات memoized، وثُبّتت قيمة المصفوفة الفارغة الافتراضية لمنع تغيّر المرجع بلا سبب.
5. `ConversationList` كان ينشئ قائمة معرفات الحضور من جديد في كل تصيير، رغم أن `usePresence` يطلب من المستدعين تمرير مصفوفة مستقرة. أصبحت القائمة memoized.

لم أغيّر سياسة التخزين المؤقت أو نظام الـAPI أو استراتيجية CSP في هذه الجولة؛ بعض ميزات Next.js غير المستخدمة لا تناسب بنية المشروع الحالية أو تحتاج ترقية وتجارب توافق قبل تفعيلها.

## 2. الإصلاحات المطبّقة

| الملف | المشكلة | التعديل |
|---|---|---|
| `components/messages/ChatWindow.tsx:10,676` | حالة الكتابة كانت في الأب كبير الحجم | استبدال الحالة والاشتراك بمكوّن `ConversationTypingIndicator` مستقل |
| `components/messages/ConversationTypingIndicator.tsx` | لم يكن هناك حد تصيير مستقل لمؤشر الكتابة | اشتراك محلي، تجاهل أحداث المستخدم الحالي، تنظيف الاشتراك والمؤقت، وإخفاء المؤشر بعد 4 ثوانٍ إذا لم تصل إشارة إيقاف |
| `components/ads/AdDetail.tsx:84,166` + `components/ads/AdDetailGallery.tsx` | اختيار صورة الإعلان كان يحدّث تفاصيل الإعلان كلها | نقل `imageIndex` و`lightboxOpen` والتنقل باللمس/الأسهم إلى معرض memoized؛ مصفوفة الصور في الأب مستقرة عبر `useMemo` |
| `components/stores/ProductDetail.tsx:57,88` + `components/stores/ProductDetailGallery.tsx` | تغيّر صورة المنتج كان يعيد تصيير الوصف والخصائص والمتجر والتوصيات | نقل حالة الصور والـDialog إلى معرض منفصل memoized |
| `components/services/ServiceListingDetail.tsx:49,64` + `components/services/ServiceListingGallery.tsx` | تغيّر صورة الخدمة كان يعيد تصيير تفاصيل الخدمة ومعلومات المزود والتقييمات | نقل حالة الصور والـlightbox والإيماءات إلى معرض منفصل memoized |
| `components/notifications/NotificationsPage.tsx:96,187` + `components/notifications/DeleteReadNotificationsAction.tsx` | فتح مربع حذف المقروء يسبب تصيير صفحة الإشعارات، وكان أيضًا يبطل حساب المجموعات بسبب مصفوفة فلترة جديدة | تثبيت `filteredByRead` حسب `[items, readTab]` وعزل مربع الحذف وحالة mutation داخل مكوّن مستقل |
| `components/messages/MessageMediaGallery.tsx:27,36,126` | المصفوفة الافتراضية قد تتغير مرجعيًا، والعدادات تُحسب في كل تصيير محلي | قيمة فارغة ثابتة + `useMemo` للعدادات والتبويبات |
| `components/messages/ConversationList.tsx:79` | إعادة إنشاء IDs الحضور عند كل تصيير | `useMemo` يعتمد على `items` و`user.id` |
| `scripts/render-regression-audit.mjs` | لا توجد حواجز تمنع عودة الأنماط المكتشفة حديثًا | إضافة checks لمؤشر الكتابة، ومعارض التفاصيل الثلاثة، والإشعارات، ومعرض الوسائط، ومعرفات الحضور |

**السلوك الوظيفي الذي تم الحفاظ عليه:** التنقل يمين/يسار وفق RTL، السحب على الجوال، فتح الصور بالحجم الكامل وإغلاقها، تمييز الصورة المختارة، مؤقت مؤشر الكتابة، تأكيد حذف الإشعارات، وحالة تحميل المزيد/تصفية البيانات.

## 3. ما بقي من مناطق إعادة التصيير أو العمل الذي يحتاج قياسًا

### أ. مناطق تتطلب مراجعة أداء ميدانية

هذه ليست كلها أخطاء مؤكدة؛ هي أكبر أماكن تستحق React Profiler على جهاز ومتصفح حقيقيين:

| الملف | البصمة الساكنة | لماذا يستحق القياس؟ |
|---|---:|---|
| `components/admin/AdminInfrastructureGateway.tsx` | 34 `useState` و26 تعبير `.map()` | شاشة إعدادات إدارية تجمع حالات إعدادات backend/frontend/Go وجداول متعددة؛ أي تغيير حقل قد يعيد تشغيل المكوّن الكبير. يُفضّل تقسيمها حسب أقسام الخدمة وصفوف memoized، لكن بعد تحديد الأقسام التي تتسبب فعليًا في زمن تصيير مرتفع. |
| `components/admin/AdminConsolePanel.tsx` | 4 حالات و8 خرائط | سجل الأوامر والطلبات والأخطاء قد ينمو؛ اعزل سجلّات العرض عن إدخال الأوامر عند ظهور كلفة ملموسة. |
| `components/admin/AdminDeviceErrorsPanel.tsx` | 7 حالات و8 خرائط | الفلاتر وتبديل تفاصيل السجل قد يعيدان معالجة القائمة؛ تحقق من عدد السجلات المعروضة وطولها قبل إضافة virtualization. |
| `components/admin/AdminAnalyticsDashboard.tsx` | 6 خرائط | راقب أثر تغير الفلاتر أو إعادة جلب البيانات على الرسوم والملخصات. |
| `components/messages/ConversationList.tsx` | 7 خرائط | تغيير البحث/الفلاتر يعيد بناء عناصر القائمة، وهذا متوقع جزئيًا؛ الصفوف نفسها memoized. إذا أصبح عدد المحادثات كبيرًا، قِس الحاجة إلى virtualization. |
| `components/notifications/NotificationsPage.tsx` | 6 خرائط | الصفوف memoized وتستخدم `content-visibility`; فتح مربع الحذف والفلترة غير المرتبطة بالقائمة عولجا. تحميل المزيد وتغيّر البيانات يجب أن يعيدا بناء الجزء المتأثر. |
| `components/messages/MessageMediaGallery.tsx` | 4 خرائط | العدادات صارت memoized؛ تحديث `items` أو `queuedItems` ما زال يحدّث شبكة الوسائط كما ينبغي. |

سكربت `virtualization-audit.mjs` يعطي مؤشرات مبنية على `.map()` وأسماء الملفات فقط؛ لا يثبت حجم القائمة أو عدد العناصر التي تظهر فعليًا. لا أنصح بإضافة مكتبة virtualization لكل قائمة اعتمادًا على هذا العدد وحده، خصوصًا مع وجود pagination و`content-visibility` في مواضع كثيرة.

### ب. إبطال React Query واسع النطاق

نتيجة `query-invalidation-audit.mjs` الحالية: **205 استدعاءات `invalidateQueries` إجمالًا، منها 32 استدعاءً على جذور واسعة** مثل `stores.all()` و`categories.all()` و`stories.all()` و`serviceRequests.all()` و`appointments.all()`.

أهم الملفات التي تستحق فحصًا تفصيليًا لكل mutation:

- `hooks/mutations/useAdminMutations.ts`
- `hooks/mutations/useCategoryMutations.ts`
- `hooks/mutations/usePromotionMutations.ts`
- `hooks/mutations/useSaleMutations.ts` و`useInstallmentMutations.ts`
- `hooks/mutations/useStoryMutations.ts`
- `hooks/useNotificationStream.ts`

**لا ينبغي استبدال كل `.all()` بمفتاح أدق آليًا.** بعض العمليات تغير أكثر من قائمة فعلًا، كما أن استعادة اتصال SSE بعد فجوة قد تتطلب مزامنة أكثر من مورد. المطلوب هو ربط كل invalidation بالبيانات التي تتغير فعليًا، ثم استهداف المفاتيح الأبناء حيث لا يتغير غيرها. لم أغيّر هذه المجموعة في هذه الجولة حتى لا أسبب بيانات قديمة في الواجهة.

### ج. مستمعات الاتصال المباشرة

`render-audit.mjs` يسجل 4 مستمعات `online/offline` خامًا في `lib/networkLifecycle.ts` و`lib/pwa.ts`. هذه ليست تلقائيًا نسخًا مكررة من `useOnlineStatus`: بعضها مخصص لدورة حياة Service Worker، وتأجيل reload، أو تحديث التطبيق. لا ينبغي دمجها جميعًا في اشتراك حالة اتصال عام قبل تمييز وظيفة كل مستمع.

### د. التصيير المتوقع الذي لا ينبغي اعتباره مشكلة

- وصول رسالة جديدة أو تغيير حالة قراءة الرسائل سيعيد تصيير `ChatWindow` أو جزء البيانات المرتبط بها؛ هذا طبيعي. الحماية الحالية هي `ChatMessageRow` memoized وتمرير `isRetrying` على مستوى الصف بدل تمرير `retryingQueueId` المشترك.
- تغيير نص البحث، الفلاتر، أو زيادة عدد العناصر المعروضة يعيد تصيير القائمة المعنية؛ هذا ضروري لعرض النتائج الجديدة، وليس إعادة تصيير غير مبررة.
- استدعاء `setState` في مكوّن فرعي مستقل لا يعيد تصيير الأب؛ وهذا هو المبدأ الذي تم تطبيقه على المؤشر والمعارض ومربع تأكيد الحذف.

## 4. حالة الحواجز والتحسينات الموجودة مسبقًا

وجدت طبقة حماية جيدة موجودة أصلًا ولم أكرر بناءها:

- بطاقات الإعلانات والمنتجات والمتاجر والخدمات وصفوف القوائم ذات التكرار العالي تستخدم `React.memo` و`content-visibility:auto` مع `contain-intrinsic-size`.
- `ChatMessageRow` memoized، وحالة إعادة المحاولة ممثلة ببوابة boolean خاصة بالصف.
- `MessageInput` يفصل محرر نص الرسالة عن حالة `ChatWindow`.
- `useOnlineStatus` يستخدم سجل اشتراك مشترك؛ التقرير الساكن رصد 50 ملف استخدام و66 استدعاء hook، وليس 66 مستمع متصفح.
- ساعة الوقت النسبي مشتركة وعلى مستوى الدقيقة مع مراعاة الظهور والـhydration.
- حالة المفضلة تستخدم سجل اشتراك مشترك، بدل اشتراك QueryCache مستقل لكل بطاقة.
- توجد حدود تحميل وأخطاء، وتحسينات hydration موثقة بسكربتات حراسة.

بعد إضافة خمسة مكوّنات memoized جديدة (المؤشر + المعارض الثلاثة + عزل إجراء الحذف) وصل عداد `React.memo` الساكن إلى **41**. هذا عدد مواضع مصدرية وليس عددًا لعمليات التصيير الفعلية.

## 5. جرد ميزات Next.js — المستخدم وغير المستخدم

### أ. ميزات مستخدمة بالفعل

| الميزة | الموجود في المشروع |
|---|---|
| App Router وServer Components | صفحات المسارات العامة ذات التفاصيل تُجلب على الخادم ثم ترطب البيانات عند الحاجة |
| `metadata` و`generateMetadata` | يوجد تصدير metadata ثابت في 51 ملفًا، و`generateMetadata` في 12 ملفًا على مستوى `frontend/` |
| `viewport` | موجود كتصدير ثابت في `app/layout.tsx`؛ عدم وجود `generateViewport` ليس نقصًا |
| `next/image` | يستخدم عبر `SafeImage` و`CloudinaryImage`؛ لا حاجة لاستبدال كل `<img>` تلقائيًا لأن بعض الصور Blob/Data/معاينات محلية |
| `next/font` | الخطوط العربية واللاتينية تُجهّز محليًا عبر `next/font` |
| `next/script` | مستخدم لأداة تتبع hydration في التطوير وباستراتيجية تحميل مؤجلة |
| `Suspense` وdynamic import | توجد استعمالات في 49 ملفًا، ومنها أجزاء ثقيلة وواجهات لا تُحمّل إلا عند الحاجة |
| ملفات التحميل والخطأ | 22 ملف `loading.tsx` و8 ملفات `error.tsx` و3 ملفات `not-found.tsx` |
| Route Handlers | توجد 6 ملفات `route.ts`؛ لكن الـAPI التجاري الأساسي يظل Express المنفصل |
| `redirects()` و`rewrites()` | مهيأة داخل `next.config.ts` |
| `output: 'standalone'` | مفعّل لإخراج التشغيل المستقل |
| `React.cache()` | مستعمل في `lib/prefetch.ts` لتوحيد طلب البيانات بين `generateMetadata` والصفحة ضمن دورة التصيير نفسها |

### ب. ميزات غائبة أو غير مستغلة

| الميزة | نتيجة البحث | التقييم |
|---|---:|---|
| `generateStaticParams` | 0 | ليس نقصًا حاليًا لقوائم السوق والإعلانات والمنتجات والمستخدمين التي تتغير باستمرار؛ لا تُولّد كل المعرفات عند build. يمكن التفكير به فقط لمسارات ثابتة قليلة ومحددة. |
| Server Actions (`'use server'`) | 0 | قرار معماري مفهوم: عمليات التطبيق تمر عبر Express وTanStack Query. نقلها إلى Server Actions سيخلق مسار API ثانيًا ويتطلب استراتيجية مصادقة/CSP/cache موحّدة. لا أوصي بإضافتها لمجرد استخدامها. |
| `useActionState` / `useFormStatus` / `useOptimistic` | 0 | النماذج والتحديثات تعمل عبر hooks وTanStack Query؛ لا تكرر optimistic state في React قبل تقييم MutationCache الحالي. هذه الأدوات مفيدة إذا انتقل جزء محدد إلى Server Actions، وليست ترقية عامة تلقائية. |
| `revalidatePath` / `revalidateTag` / `unstable_cache` / `'use cache'` | 0 | المشروع لا يستخدم Next Data Cache حاليًا؛ لأنه يعتمد على API خارجي وReact Query مع Worker/Redis/Express. لا فائدة من revalidation قبل اعتماد بيانات خادم Next مخزنة فعليًا. |
| `instrumentation.ts` | غير موجود | فرصة جيدة لرصد أخطاء ووقت تشغيل SSR وطلبات Next من الخادم، وربطها برصد Web Vitals وأخطاء الجهاز الحالي. يتطلب اختيار OpenTelemetry/مزود الرصد والتحقق من runtime في Cloudflare. |
| `after()` | 0 | ليس نقصًا حرجًا. يمكن أن يفيد لأثر جانبي قصير غير حرج بعد الرد، لكنه ليس بديلًا عن Queue/Worker ولا يجب وضع مهام مضمونة التنفيذ فيه. |
| `next/form` | 0 | لا يظهر نقص واضح في النموذج الحالي؛ أغلب تدفقات السوق مرتبطة ببيانات Express وReact Query. |
| `default.tsx` | 0 | مطلوب لحالات Parallel Routes/slots محددة، ولا يوجد دليل على أن المشروع يحتاجها حاليًا. |
| `generateViewport` | 0 | غير مطلوب لأن `export const viewport` موجود أصلًا في الـroot layout. |

### ج. أهم فرص تحسين Next.js الموصى بها

#### 1. React Compiler — الأولوية الأعلى لتجربته

المشروع حاليًا يطلب `next: ^15.5.27` وReact `19.2.8`، ولا يفعّل React Compiler. في Next.js 16 أصبح دعم React Compiler مستقرًا، ويُفعّل عبر `reactCompiler: true` مع تثبيت `babel-plugin-react-compiler`. يمكنه إضافة memoization تلقائيًا وتقليل بعض إعادة التصيير المتسلسلة، لكنه لا يصلح سوء ملكية الحالة مثل وجود state معرض الصور داخل صفحة التفاصيل؛ لذلك كانت الإصلاحات اليدوية أعلاه لازمة أيضًا. توقع زيادة وقت compilation في التطوير والبناء.

**توصيتي:** اختباره بعد إنشاء baseline على staging، وتفعيل تدريجي/annotation mode أولًا إن لزم، ومقارنة build time وProfiler قبل وبعد. لا أفعّله في هذا التعديل لأن المشروع لم يثبت توافق ترقية Next/Cloudflare في بيئته الفعلية بعد.

#### 2. Cache Components و`'use cache'` — فرصة قوية للصفحات العامة، لا للمحتوى الشخصي

Next.js 16 يتيح `cacheComponents: true` ثم `use cache` و`cacheLife` و`cacheTag` لتخزين مكوّن أو دالة/بيانات خادمية قابلة لإعادة الاستخدام. يمكن تطبيقه مبدئيًا على أجزاء عامة مستقرة مثل وصف نوع الخدمة، تصنيفات عامة، أو إعدادات واجهة لا تتغير لكل مستخدم. يجب تمرير أي قيم ديناميكية مثل هوية المستخدم أو الترويسة/الكوكي إلى نطاق التخزين بطريقة صريحة؛ لا تقرأ `cookies()` أو `headers()` من داخل نطاق مخزن مؤقت، ولا تخزن بيانات الحساب أو المفضلة أو الرسائل أو المخزون الحساس بشكل مشترك.

**قيد معماري مهم:** `app/layout.tsx` يقرأ `cookies()` لمعرفة تفعيل لوحة التصحيح ويقرأ `headers()` للحصول على CSP nonce، وتعليقات المشروع توضح أن هذا مقصود لحماية سكربتات Next و`next-themes`. هذا يجعل الـroot request-dependent؛ لا تحذف هذه القراءة لمجرد جعل الصفحات static. قبل تفعيل Cache Components يجب عزل الأجزاء الديناميكية بعناية ضمن حدود Suspense/الـlayout المناسبة. الترقية إلى Next16 لا تعني مجرد إضافة `cacheComponents: true`؛ الوثائق تنبه إلى أن ذلك قد يكشف أخطاء build بسبب بيانات ديناميكية غير محاطة بـSuspense.

#### 3. `instrumentation.ts` وOpenTelemetry

إضافة `instrumentation.ts` فرصة فعلية، لا لتحسين React render مباشرة بل لرؤية أداء الخادم: زمن SSR، أخطاء تشغيل الصفحات، أخطاء Route Handlers، والاختلاف بين بطء API وبطء الرندر. اربطه بمعرف الطلب الذي تضيفه middleware، وبأدوات Web Vitals الحالية، مع فصل التسجيل بين Node وCloudflare Worker runtime. لا تضع بيانات شخصية أو رموز جلسات في traces.

#### 4. مراجعة تحسين الحزم في `next.config.ts`

التعليق قرب `PERF-04` يتحدث عن توسيع `optimizePackageImports` إلى Radix وTanStack وclsx وغيرها، لكن القائمة الفعلية تضم فقط `lucide-react` و`sonner` و`zod`. كما أن `lucide-react` مدرج ضمن الحزم التي يحسّنها Next افتراضيًا في الوثائق الحالية، ويوجد في الملف أيضًا `modularizeImports` مستقل له. لا أضيف حزمًا أخرى عشوائيًا: وثائق Next تصنف `optimizePackageImports` ميزة تجريبية، وتوصيتي قياس حجم chunks ووقت build أولًا، ثم حذف التحويل المكرر أو إضافة حزم بعينها فقط إذا أثبت التحليل وجود barrel-import bottleneck.

## 6. قرار ترقية Next.js 16

**لا أنصح بتغيير Next.js إلى 16 في نفس دفعة إصلاح التصيير.** رغم أن أحدث وثائق Next تشير إلى 16.4.5 وأن Next15 ما زال ضمن Maintenance LTS حتى 31 يناير 2027، توجد نقاط توافق خاصة بمشروعك يجب حلها أولًا:

1. Next16 يستخدم Turbopack افتراضيًا في `next dev` و`next build`. يجب تجربة إعدادات webpack/plugins وأوامر البناء الحالية معه.
2. Next16 أعاد تسمية `middleware` إلى `proxy`، وProxy يعمل على Node.js runtime. الملف الحالي `frontend/middleware.ts` مسؤول عن auth routing وCSP nonce، وتعليقه الداخلي يصف تشغيله على Node runtime.
3. توثيق OpenNext Cloudflare الحالي يذكر دعم Next16، لكنه يذكر أيضًا أن Node Middleware غير مدعوم. بما أن middleware/Proxy عندك مرتبط بالأمان وCSP، يجب إثبات توافقه في Worker فعليًا قبل الترقية، وعدم الاكتفاء بنجاح `next build`.
4. افحص تغييرات الصور في Next16 وقيود `next/image` والـURLs المحلية ذات query string، وكذلك تغيرات `minimumCacheTTL`، قبل نشر النسخة.

المسار الآمن: فرع ترقية مستقل → تحديث Next وOpenNext معًا إلى إصدارات متوافقة → اختبار middleware/CSP/Auth وHTML/RSC caching على Worker preview → build وE2E → ثم تفعيل React Compiler → وبعد ثبات ذلك تجربة Cache Components على أجزاء عامة فقط.

## 7. التحقق والقيود

| الفحص | النتيجة |
|---|---|
| `node scripts/render-regression-audit.mjs` من `frontend/` | **PASS** بعد إضافة حواجز الأنماط الجديدة |
| `node scripts/hydration-regression-audit.mjs` من `frontend/` | **15/15 PASS** |
| `node scripts/render-audit.mjs` من `frontend/` | 50 ملف استخدام `useOnlineStatus`، 66 استدعاء hook، 4 مستمعات خام، 41 موضع `React.memo` |
| `node scripts/query-invalidation-audit.mjs` من `frontend/` | 205 invalidate calls، و32 استدعاء broad/root |
| فحص صياغة TSX للملفات المعدّلة باستخدام TypeScript `transpileModule` | **0 أخطاء صياغة** |
| `tsc --noEmit` / Next production build | **لم يكتمل** لأن `node_modules` غير موجودة في النسخة المفحوصة؛ لم أعتبر فحص الصياغة بديلًا عن type-check أو build |
| React DevTools Profiler / متصفح حقيقي | لم يُشغّل في بيئة التدقيق هذه |

**حدود النتيجة:** هذا تدقيق واسع للمصدر والأنماط، لكنه لا يستطيع عدّ كل render فعلي أو قياس الزمن بدون تشغيل نسخة التطوير/الإنتاج على بيانات ممثلة وReact Profiler. لذلك صنفت المناطق الإضافية كمرشحات للقياس، ولم أصف كل `.map()` أو كل state على أنها مشكلة.

## 8. المراجع الرسمية لميزات Next.js

- [React Compiler — Next.js configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/reactCompiler)
- [Next.js 16 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Cache Components / `use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache)
- [Next.js instrumentation](https://nextjs.org/docs/app/guides/instrumentation)
- [OpenNext Cloudflare compatibility and supported features](https://opennext.js.org/cloudflare)
- [Next.js support policy](https://nextjs.org/support-policy)
- [optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports)
