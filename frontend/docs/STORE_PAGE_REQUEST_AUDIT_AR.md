# تدقيق طلبات صفحة المتجر وإصلاحها

**النطاق:** مراجعة نسخة `marketplat-main` المرفوعة، مع مقارنة مصدر الصفحة وسلوك hooks وطلبات API بسجل Network المرسل لصفحة `/stores/cmt0lxqkj002gt54lutaphho7`.

## النتيجة المختصرة

سجل المتصفح يحتوي 15 طلبًا: 10 طلبات API إلى نطاق الـ API و5 طلبات RSC إلى نطاق الواجهة. ليس كل طلب متكررًا أو زائدًا؛ التعديلان الفعليان اللذان ثبتت أسبابهما في المصدر هما:

1. كان فحص متابعة متجر واحد يحمل قائمة المتاجر المتابَعة حتى 100 سجل. استُبدل بفحص حالة متابعة الهدف المحدد عبر endpoint موجود أصلًا.
2. مسار استرداد صفحة المتجر عند فشل جلب Server Component كان يعرض توصيات لا يعرضها المسار الأساسي، ما يؤدي إلى تحميل بيانات غير متسقة مع الصفحة العادية. أزيلت التوصيات من مسار الاسترداد.

أما تغيير التبويبات، فالنسخة المرفوعة كانت تستخدم بالفعل `writeClientUrl` المبني على History API. طلبات RSC التي ظهرت في السجل لا تتطابق مع هذا المصدر الحالي؛ لذلك تم تصحيح الاختبار ليؤكد السلوك الموجود، ولم يتم الادعاء بتغيير كود التنقل نفسه.

## ما تغيّر

### 1. حالة متابعة المتجر: استعلام مستهدف بدل قائمة كاملة

- قبل التعديل: `StoreHeader` يستدعي `useIsFollowingStore(store.id)`، وكان hook يقرأ حالة المتابعة من `useMyFollowedStores({ limit: 100 })`.
- بعد التعديل: `useIsFollowingStore` يستخدم `useFollowStatus('STORE', storeId)`، والذي يستدعي endpoint:
  `GET /follows/status/STORE/{storeId}`
- endpoint موجود في الباك إند مسبقًا: `apps/api/src/modules/follows/follows.routes.ts`، ويعيد قيمة `following` من المتحكم.
- يتم تعطيل الاستعلام عندما لا يكون المستخدم مسجلًا، ولذلك لا يُجرى طلب حالة متابعة لمستخدم مجهول.
- تحديث المتابعة/إلغاء المتابعة يكتب قيمة boolean في Query Cache الخاص بالهدف، مع إبقاء كاش قائمة المتاجر المتابَعة قابلًا للتحديث للشاشات التي تحتاج القائمة.
- أزيلت بنية Set قديمة (`followedIds`) لم تعد مستخدمة بعد اعتماد استعلام الحالة الفردية.

**الأثر المتوقع:** يختفي طلب `GET /stores/me/followed?limit=100` الناتج فقط عن فتح صفحة متجر منفردة، ويحل محله طلب حالة واحد للمتجر للمستخدم المسجل، عند عدم وجود قيمة صالحة في الكاش. أما صفحة «المتاجر التي أتابعها» فما زالت تستخدم `useMyFollowedStores` بقصد عرض القائمة؛ لم يُحذف هذا الاستخدام.

### 2. توصيات المتاجر من مسار الاسترداد

المسار الأساسي في `frontend/app/(public)/stores/[id]/page.tsx` يعرض رأس المتجر وواجهة التبويبات فقط، ولا يركب مكوّن توصيات. لكن `frontend/components/stores/StoreDetailClient.tsx`، المستخدم كمسار استرداد عند تعثر الجلب على الخادم، كان يضيف `StoreRecommendations` بشكل غير متسق مع الصفحة الأساسية.

أزيل تحميل/تركيب مكوّن التوصيات من `StoreDetailClient`. أضيف اختبار يضمن أن مسار الاسترداد يعرض رأس المتجر وواجهة المتجر دون تشغيل استعلام توصيات غير معروض في المسار الأساسي.

**الأثر المتوقع:** طلب `/recommendations?...&type=store` الذي كان ينشأ من مسار الاسترداد لن يعود مطلوبًا من هذا المسار بعد نشر النسخة المعدلة. إذا بقي الطلب في Network، يجب فحص `Initiator` لتحديد مكوّن آخر يطلبه؛ لا يمكن نسبة أي طلب توصيات في المتصفح إلى مصدر واحد اعتمادًا على URL وحده.

### 3. التبويبات وطلبات RSC

في المصدر المرفوع، `frontend/components/stores/StoreStorefront.tsx` يحدّث معامل `tab` باستعمال `writeClientUrl(..., 'push')`، وليس `router.push`. بالتالي، تغيير التبويب مصمم ليحدّث URL محليًا دون طلب RSC جديد. اختبار `StoreStorefront.test.tsx` كان يتوقع `router.push` القديم؛ تم تحديثه ليختبر `window.history.pushState` وتحديث عنوان الصفحة محليًا.

**حدود الاستنتاج:** سجل Network أظهر ثلاثة طلبات RSC لمعاملات `tab=offers` و`tab=collections` و`tab=ads`. هذا لا يطابق مسار الكود المرفوع الحالي، ولا يثبت وحده أن طلبات RSC صدرت من زر التبويب. الاحتمالات تشمل أن النسخة المنشورة أقدم من الملف المرفوع، أو وجود bundle قديم، أو سبب تنقل/Prefetch آخر. يجب إعادة القياس بعد النشر مع فحص `Initiator` و`Type` و`Purpose` لكل طلب.

كذلك ظهر طلبان RSC أوليان للمسار نفسه ومعامل `_rsc` مختلف. لم يُحذف أي منهما؛ لا يوجد من السجل المختصر دليل كافٍ لتصنيف أحدهما كتكرار غير لازم.

## قراءة طلبات Network التي أبقيناها

| الطلب | القرار | السبب |
|---|---|---|
| `GET /stores/{id}` | إبقاء | جلب تفاصيل المتجر. طلب المتصفح قد يكون مسار استرداد بعد تعثر جلب Server Component؛ ليس تكرارًا مثبتًا. |
| `GET /favorites/stores/{id}/check` | إبقاء | فحص حالة مفضلة المتجر لزر المفضلة. |
| `GET /badges/store/{id}` | إبقاء | بيانات شارات المتجر التي تعرضها الواجهة. |
| `GET /notifications/unread-count` | إبقاء | طلب مشترك من جرس الإشعارات في التنقل العام؛ لا دليل هنا على أن صفحة المتجر وحدها تطلقه. |
| `GET /products?...` | إبقاء | محتوى تبويب المنتجات. |
| `GET /products?...&hasPromotion=true` | إبقاء | محتوى تبويب العروض؛ توقيته بعد طلب المنتجات الأول يتوافق مع تبديل التبويب، ولا يثبت تكرارًا. |
| `GET /collections/store/{id}` | إبقاء | محتوى تبويب المجموعات. |
| `GET /ads?storeId={id}` | إبقاء | محتوى تبويب الإعلانات. |
| `GET /follows/status/STORE/{id}` | البديل المقصود | حالة متابعة متجر واحد بدل قراءة قائمة المتاجر المتابَعة. |
| `GET /stores/me/followed?limit=100` | إزالة من سياق صفحة المتجر | لم يعد لازمًا لاستخراج boolean واحد؛ يظل جلب القائمة متاحًا لصفحة القائمة التي تعرض المتاجر المتابَعة. |
| `GET /recommendations?...&type=store` | إزالة من fallback | التوصيات غير معروضة في صفحة المتجر الأساسية، لذا أزيلت من مسار الاسترداد أيضًا. |

## أزمنة الاستجابة المرصودة في السجل

هذه قياسات متصفح من لحظة إرسال الطلب حتى اكتماله، ولا تمثل زمن قاعدة البيانات وحدها:

| المسار | الزمن |
|---|---:|
| `/notifications/unread-count` | 2393 ms |
| `/ads?storeId=...` | 1933 ms |
| `/stores/{id}` | 1785 ms |
| `/collections/store/{id}` | 1110 ms |
| `/products?...&hasPromotion=true` | 1170 ms |
| `/recommendations` | 999 ms |

أزلنا طلب التوصيات من مسار الاسترداد، لكن لا يمكن الجزم بزمن التحسن الفعلي قبل قياس الصفحة بعد النشر. كما لا يمكن عزو بطء الإشعارات أو المتجر إلى Postgres أو Worker أو الشبكة دون tracing موزع أو سجلات توقيت لكل طبقة.

## ملفات التغيير

- `frontend/hooks/queries/useStores.ts`
- `frontend/hooks/mutations/useStoreMutations.ts`
- `frontend/hooks/mutations/useFollowMutations.ts`
- `frontend/components/stores/StoreDetailClient.tsx`
- `frontend/lib/queryKeys.ts`
- `frontend/__tests__/unit/hooks/useStores.test.tsx`
- `frontend/__tests__/unit/hooks/useStoreMutations.test.tsx`
- `frontend/__tests__/components/StoreStorefront.test.tsx`
- `frontend/__tests__/components/StoreDetailClient.test.tsx` — جديد
- `frontend/scripts/render-regression-audit.mjs`
- `frontend/scripts/followed-store-cache-consistency-audit.mjs`

## نتائج الفحوص

**نجحت الفحوص التالية على نسخة العمل:**

- `render-regression-audit.mjs`
- `detail-query-dedup-phase3-audit.mjs` — 33/33
- `http-request-phase3-audit.mjs` — 15/15
- `network-request-monitor-audit.mjs` — 21/21
- `store-profile-cache-consistency-audit.mjs` — 10/10
- `followed-store-cache-consistency-audit.mjs` — 6/6
- `necessary-request-audit.mjs`
- `rsc-boundary-phase4-audit.mjs` — 21/21
- `query-key-audit.cjs` — 145 تعريف استعلام/Hook يستعمل مصنع مفاتيح Query المركزي
- `query-invalidation-factory-audit.cjs` — 244 عملية كاش تستعمل مفاتيح مشتقة من المصنع
- `node --check` لسكريبتَي التدقيق المعدّلين.

**فحص مستقل لم ينجح:**

`prefetch-policy-audit.mjs` أعاد FAILED: وجد 358 رابطًا بدل 362 في manifest، وأظهر اختلافات غير مرتبطة بملفات صفحة المتجر في:

- `frontend/components/requests/MyRequestOffersPageClient.tsx`
- `frontend/components/requests/MyRequestsPageClient.tsx`
- `frontend/components/requests/RequestsPageClient.tsx`

هذه الملفات ليست ضمن نطاق التغيير في هذه الحزمة؛ لذلك لم أعدلها لإخفاء فشل خارج المهمة.

**ما لم يُشغّل:**

- Vitest: لم يُشغّل لعدم وجود `node_modules`/حزمة `vitest` في الأرشيف.
- `npm run type-check` أو `tsc --noEmit` الكامل: لم يُشغّل لعدم توفر dependencies الخاصة بالتطبيق.
- بناء Next.js/Cloudflare: لم يُشغّل للسبب نفسه.

نجاح فحوصات static audit وparser لا يعادل اجتياز TypeScript الكامل أو اختبارات التكامل أو التحقق على الإنتاج.

## ما يلزم التحقق منه بعد الدمج والنشر

1. افتح صفحة متجر بحساب مسجل: ينبغي ألا يظهر `GET /stores/me/followed?limit=100` بسبب زر متابعة المتجر؛ تحقق من طلب `/follows/status/STORE/{id}` بدلًا منه عند عدم وجود cache.
2. افتح الصفحة بحساب مجهول: ينبغي ألا يُرسل طلب حالة متابعة.
3. جرّب المتابعة وإلغاءها ثم انتقل إلى قائمة المتاجر المتابَعة؛ تأكد أن زر الحالة والقائمة متزامنان.
4. راقب هل اختفى طلب `recommendations` من مسار استرداد المتجر.
5. غيّر تبويبات المتجر وراجع `Initiator` لطلبات RSC. إذا استمرت طلبات RSC مع هذا المصدر، التقط تفاصيلها بعد مسح cache وإعادة تحميل hard reload.
6. قارن أزمنة المتجر والإشعارات والإعلانات بعد النشر، ولا تنسب مصدر البطء قبل توفر قياسات الخادم والـ Worker.
