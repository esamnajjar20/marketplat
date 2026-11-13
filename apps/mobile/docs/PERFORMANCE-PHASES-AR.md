# خطة الأداء — المراحل 1 إلى 3 (ما نُفّذ وما لم يُنفّذ ولماذا)

## قبل أي تشغيل
```bash
cd <repo-root>
pnpm --filter @marketplat/mobile exec expo install @shopify/flash-list   # يحدّث package.json و pnpm-lock.yaml
pnpm --filter @marketplat/mobile type-check && pnpm --filter @marketplat/mobile test
# ثم بناء native جديد (مكتبة native): expo run:android
```
> `verify-phase2-build-config` يفشل حتى يُحدَّث `pnpm-lock.yaml` (سلوك متوقع: الحارس يشترط وجود الاعتمادية في القفل).

## المرحلة 1 — القوائم
- `AppFlashList` (غلاف FlashList v2): للقوائم الطويلة العمودية. قيود FlashList: `contentContainerStyle` padding فقط (لا gap/flexGrow)، ولا `getItemLayout`/`windowSize`.
- حُوّلت: البحث، المفضلة، إعلاناتي، الرسائل، الإشعارات، المنتجات، الخدمات، المتاجر.
- **الرئيسية**: الجذر يبقى FlatList (5 صفوف غير متجانسة فيها TextInput — التدوير يضرّ هنا). carousel الإعلانات صار `AppFlashList` أفقيًا (فاصل عبر `ItemSeparatorComponent` لأن FlashList لا تدعم `gap`)، وحُذف `getItemLayout`/`fixedHorizontalItemLayout` لأنه غير مدعوم فيها. **لم يُختبر على جهاز**: تأكد من ارتفاع الصف الأفقي ومن التمرير المتداخل داخل قائمة الرئيسية.
- حُذفت من `listPerformance.ts` التصديرات غير المستعملة والمضللة (`adListProps` و`listItemHeights` و`fixedItemLayout` و`chatListProps`).
- `getItemLayout` **لم يُفرض على AdCard/CatalogCard**: ارتفاعهما غير ثابت فعليًا (عنوان يلتف، `minHeight` فقط)، وتمرير قيمة خاطئة يسبب قفزات في التمرير. FlashList يغني عنه.
- `SearchResultCard` و`MyAdRow` استعملا `useCallback` داخل الصف بدل lambdas مباشرة.
- البطاقات: `id` + دوال `onPressItem/onToggleFavoriteItem/onImageErrorItem` ثابتة بدل lambdas داخل renderItem؛ الدوال القديمة ما زالت مدعومة.

## المرحلة 2
- `PageList` (قائمة افتراضية بنفس رأس PageShell) وتحويل `sellers-ranking` و`saved-offline`.
- حُوّلت لاحقًا: `offline-queue` (صفوف افتراضية بـ `getItemType` لكل نوع طابور، والمعالجات منقولة حرفيًا داخل `renderRow`) و`service-reviews` (`PageList`؛ النموذج في التذييل).
- **لم تُحوَّل عمدًا**: `sessions` و`my-stores` (عدد صغير بطبيعته). **أخطاء في التدقيق**: `profile/[id]/following` و`my-sales` و`my-products` أصلًا `FlatList` افتراضية (لا `.map`)؛ أما `following` و`ads` فتنقّل صفحات (20 و12 عنصرًا للصفحة، تُستبدل عند التنقل) فلا تتجاوز عتبة الـ20 عنصرًا؛ `messages/[id]` محادثة بـ `maintainVisibleContentPosition` و`scrollToEnd` فلا تُنقل إلى FlashList دون اختبار على جهاز.
- الأقسام الثانوية في الرئيسية: كانت lazy بالـviewability أصلًا؛ أضيف شرط «استقرار الإعلانات + مهلة 300ms بعد أول رسم» وهيكل تحميل ثابت.
- الصور: `AppImage variant="list"` (بدون fade عند تدوير الخلية) و`recyclingKey`/`cachePolicy` كانت موجودة. `src/lib/list-image.ts` لاختيار صورة واحدة وقصّ المصفوفات.
- الأحجام (thumbnails) من السيرفر تحتاج backend — لم تُنفَّذ.

## المرحلة 3
- `scrollActivity` + `runWhenScrollIdle`: تتبّع السحب/الزخم تلقائيًا (AppFlashList + قائمة الرئيسية)، وتأجيل أعمال ثانوية (resync بعد عودة الاتصال، قراءة/Toast نتيجة الـOutbox) مع حد انتظار أقصى 1.5s لتفادي التجويع.
- **مراجعة الـOutbox**: الجسور الثلاثة تُرجع `null` ولا تُحدّث state في الشاشات المفتوحة؛ القراءة الوحيدة بعد المزامنة هي `listOfflineCreates` (أُجّلت أثناء التمرير). لا setState متكرر.
- الكاش: الإخلاء حسب TTL/العدد/الحجم كان يعمل عند **الكتابة**؛ أضيف `prunePublicCacheExpired` مرة واحدة بعد الإقلاع بـ4s.
- الإقلاع: جسور Outbox/Favorites/ChatOutbox داخل `DeferredMount` (بعد أول رسم). **Sentry لم يُؤجَّل** (يفقد أخطاء الإقلاع المبكرة) و**Push لم يُؤجَّل** (النقر البارد على إشعار).
- Proguard/Shrink: مفعّلان أصلًا (`app.json` و`gradle.properties`).
- القياس: `startJsFpsMonitor` (تطوير فقط) يحذّر عند JS FPS < 45. `pnpm --filter @marketplat/mobile analyze:bundle` يطبع أحجام الحزمة.

## ما لم يُقَس
لم يُشغَّل التطبيق ولا `tsc` الكامل ولا vitest في بيئة التنفيذ (لا node_modules ولا شبكة). قِس على جهاز Android متوسط قبل/بعد:
`npx flashlight test --bundleId <id> --testCommand "maestro test flow.yaml"` أو Perfetto، وركّز على: FPS أثناء تمرير البحث/المفضلة/الرئيسية، ووقت الإقلاع حتى أول شاشة.

## إدارة الحالة وإعادة الرسم (بند 4) — توحيد
- **TanStack Query لم يُضف**: يتطلب تثبيت اعتمادية وتحديث `pnpm-lock.yaml` (غير ممكن بلا شبكة)، والمشروع فيه طبقة موحّدة أصلًا (`usePaginatedList` للقوائم المرقّمة و`useAsyncResource` للمورد الواحد، وكلاهما يلغي الطلبات القديمة ويتجاهل الاستجابات المتأخرة) فوق Outbox/SQLite. التوحيد تم على هذه الطبقة.
- **نُقلت إلى `usePaginatedList`** (كانت تكرّر دورة الحياة يدويًا): `stores` و`service-providers` و`service-reviews`. أُضيف المحوّل `toPaginatedResponse` في `src/lib/pagination.ts` (مع اختبار) ليستعمله أي API يرجع `{items,page,totalPages}`.
- **`service-providers`**: صف البطاقة صار `memo` (`ProviderRow`) بدل `renderItem`/`ItemSeparatorComponent` inline.
- **`useHomeAds`**: `loadMoreAds` صارت ثابتة الهوية (القيم المتغيّرة تُقرأ من ref)، فلا يُعاد رسم تذييل الرئيسية والقائمة مع كل صفحة. carousel الرئيسية يستعمل `Set` بدل `includes` لكل بطاقة.
- **`service-providers/[id]`**: صار `PageList` + `useAsyncResource` (الملف) + `usePaginatedList` (الخدمات)، وصف الخدمة `memo`.
- **لم تُنقل عمدًا** (سلوك خاص يضيع مع الهوك): `messages` (دمج تحديثات الصفوف، وتحميل كل الصفحات للبحث المحلي `loadAllForLocalSearch`، وتعديل الأعلام محليًا)، و`my-ads` (`preservePages` يحافظ على الصفحات المحمّلة وموضع التمرير عند العودة، وحالة حذف Outbox)، و`service-requests` (عدم تطابق الحساب `accountMismatch`)، و`store-collections` و`store-promotions` (نماذج إدارة؛ الترقيم فيها لقائمة منتجات اختيار فقط وليست تغذية).
- التحقق: صياغة TS سليمة للملفات المعدّلة، و`verify:static` لا يضيف فشلًا جديدًا عدا فحص القفل المعروف (`@shopify/flash-list` في `pnpm-lock.yaml`)؛ الفشلات الأربعة الأخرى موجودة في النسخة الأصلية أيضًا (مسارات `apps/api` غير موجودة في بيئة الفحص). لم يُشغَّل `tsc` الكامل ولا vitest.

## توحيد إدارة الحالة — الدفعة الثانية
- نُقلت إلى `useAsyncResource`: `blocked-users` و`store-invites` (كانتا تكرّران loading/error/load يدويًا بلا حماية من الاستجابات المتأخرة عند تغيّر الحساب). أخطاء الإجراءات (`actionError`) منفصلة عن خطأ التحميل. أُزيلت lambdas الفاصل و`keyExtractor` و`items.filter` من render.
- **الدفعة الثالثة:** نُقلت أيضًا `requests` و`saved-searches` و`my-store-analytics` و`service-types` إلى `useAsyncResource`. خطأ الإجراءات منفصل عن خطأ التحميل، والسحب للتحديث «ناعم» (لا يُفرغ القائمة)، وهوية الجلب = (الحساب/الفلاتر).
- **لم تُنقل عمدًا (سلوك خاص يضيع مع الهوك):** `saved-payments`،  ، `messages/[id]` و`offline-queue` وشاشات المحرّر والتفاصيل.
- لم يُجرَّب شيء على جهاز؛ تحقّقت من صحة صياغة TS فقط (بلا `tsc` كامل).

## الدفعة الرابعة
- `activity` → `usePaginatedList` (هوية القائمة = الحساب+المجموعة+البحث المطبّق). **إصلاح سلوك:** كان يُرسَل طلب عند كل حرف في حقل البحث؛ صار بتأخير 350ms وزر «تطبيق البحث» يطبّق فورًا.
- `profile` و`service-provider-profile` → `useAsyncResource` (حقول النموذج تُهيَّأ داخل الـfetcher، و`setData` يحلّ محل `setProfile`، وخطأ الإجراءات منفصل).

## الدفعة الخامسة
- `my-store` → `useAsyncResource` (404 = «لا متجر» يُرجع null؛ تهيئة الحقول تحترم `dirtyRef`).
- `installments` → `useAsyncResource`: تُخزَّن هوية القائمة (`key`) مع الصفوف فلا تظهر أقساط نوع/حساب آخر أثناء التحميل، والتحديث بعد الدفع «ناعم» بدل شاشة تحميل كاملة، وخطأ الإجراءات منفصل.
- `sales-costs` → `useAsyncResource` بمورد واحد `{enabled, products}`؛ `setEnabled/setProducts` غلافان فوق `setData` فبقي منطق الإجراءات كما هو.

## الدفعة السادسة
- `store-team` → مورد واحد `{storeId, storeName, myRole, items}` (الاستبدال كامل أو يبقى القديم عند الفشل).
- `seller-dashboard` → `useAsyncResource`؛ الفشل الجزئي (المتجر/الملف) جزء من البيانات لا خطأ شامل.
- `sales-insights` → `useAsyncResource` بهوية (الحساب، الوضع، الفلاتر المطبّقة)؛ كل وضع يملأ حقله.
- **المتبقي عمدًا:** `saved-payments`، `messages/[id]`، `offline-queue`، شاشات المحرّر والتفاصيل (`ads/[id]`، `stores/[id]`، `products/[id]`، `services/[id]`، `requests/[id]`، `orders/[id]`، `stories/[id]`، `service-requests*`)، `appointment-create`، `order-checkout`، `store-promotions`، `store-collections`، `settings`.
