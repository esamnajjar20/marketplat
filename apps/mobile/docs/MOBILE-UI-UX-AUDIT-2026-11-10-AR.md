# تقرير تدقيق وتحديث تجربة MarketPlat للموبايل

**التاريخ:** 10 نوفمبر 2026
**النطاق:** `apps/mobile` داخل مستودع MarketPlat المرفق
**حالة التنفيذ:** تدقيق ثابت على كامل شجرة الموبايل، مع مراجعة تفصيلية للمسارات المشتركة والرئيسية والمحادثات وعناصر التصميم التي عُدّلت. هذا التقرير لا يدّعي إتمام اختبار يدوي لكل شاشة على جهاز Android فعلي.

## 1. الملخص التنفيذي

تم فحص بنية تطبيق Expo/React Native ومسارات Expo Router وطبقات المكوّنات والميزات والتخزين المحلي والشبكة والمصادقة. جرى تعديل 15 ملفًا قائمًا وحذف ملف TypeScript مكرر، وإضافة هذا التقرير.

أهم التغييرات المنفذة:

1. إزالة طلب خدمات مكرر من الصفحة الرئيسية، وتأجيل تركيب أقسام المجتمع والسوق الثانوية حتى وصول المستخدم إليها بالتمرير.
2. إبقاء قراءة اللقطات المحلية أولًا، واحترام مدة صلاحية الكاش، مع تحديث إجباري عند السحب للتحديث بعد أن تكون الأقسام قد ظهرت.
3. إزالة 7 تعريفات `row-reverse` كانت تعكس اتجاه الصف يدويًا فوق RTL الأصلي.
4. رفع أحجام عناصر تحكم مهمة إلى حد 44dp على الأقل، خصوصًا شرائح البحث وإجراءات الرسائل الفاشلة وأزرار إجراءات المحادثات.
5. تحسين تسميات/حالة الوصولية للأزرار، بما يشمل حالة الانشغال لقارئ الشاشة.
6. تحسين تباين حدود حقول وإجراءات تفاعلية إلى 3:1 على الأقل وفق حسابات luminance داخل مدقّق التصميم.
7. حذف تنفيذ مسودات مكرر وغير مستورد، والإبقاء على ملف `.mjs` الذي تستورده طبقة التخزين والاختبارات.
8. إصلاح افتراضين قديمين في مدقّقي الوصولية والعقود الحرجة كي يختبرا البنية الحالية بدل فرض تفاصيل تنفيذ سابقة.

**لا توجد تغييرات على API الخادم أو بروتوكول المزامنة أو SSE/WebSocket أو جداول SQLite أو صلاحيات الخادم.**

## 2. خريطة المستودع ومخزون التطبيق

### 2.1 بنية التنفيذ الفعلية

| المسار | الموجود فعليًا | العدد |
|---|---|---:|
| `apps/mobile/app` | مسارات Expo Router، مع ملف `_layout.tsx` | 102 شاشة/مسار + ملف layout |
| `apps/mobile/src/components` | مكوّنات عامة ومكوّنات `ui` | 33 ملف TypeScript/TSX |
| `apps/mobile/src/features` | ميزات المجال وواجهات API الخاصة بها | 68 ملفًا |
| `apps/mobile/src/hooks` | خطافات مشتركة | 3 ملفات |
| `apps/mobile/src/lib` | الشبكة والتنقّل والتنسيق والتحقق والأدوات | 41 ملفًا |
| `apps/mobile/src/state` | حالة مشتركة | ملف واحد |
| `apps/mobile/src/storage` | SQLite والكاش وطوابير المزامنة | 41 ملفًا |
| `apps/mobile/src/theme` | Tokens وملفات الثيم | 3 ملفات |
| `apps/mobile` إجمالًا | ملفات التطبيق والاختبارات والأصول والوثائق | 804 ملفات |

لا توجد في هذه النسخة مجلدات مستقلة باسم `src/screens` أو `src/navigation` أو `src/styles`؛ المقابل هو Expo Router داخل `app`، وسياسة التنقّل داخل `src/lib/navigation-policy.ts`، والأنماط المركزية داخل `src/theme` و`src/components/ui/styles.ts`.

### 2.2 مخزون المكوّنات المشتركة

`src/components` يحتوي على:

- الأساسيات: `AccessiblePressable.tsx`, `AppImage.tsx`, `Icons.tsx`, `ActionSheet.tsx`, `MobileUI.tsx`.
- التنقّل والإطار العام: `BottomNavigation.tsx`, `MobileDrawer.tsx`, `ToastHost.tsx`, `OfflineCacheNotice.tsx`.
- بطاقات السوق: `MarketCards.tsx`.
- `ui/`: `AccountSecuritySection`, `AppHeader`, `AppText`, `Button`, `DetailScaffold`, `FavoriteButton`, `Feedback`, `Field`, `FilterChip`, `MediaGallery`, `PageShell`, `ProductAttributeList`, `ProductCard`, `RatingStars`, `SaveOfflineButton`, `SearchBar`, `Section`, `SemanticIcon`, `ServiceRequestTimeline`, `ShareButton`, `StorefrontTabs`، إضافة إلى `index.ts` و`styles.ts`.

### 2.3 مخزون الميزات

| المجال | عدد الملفات |
|---|---:|
| الحساب | 5 |
| الإعلانات والمفضلة | 9 |
| المواعيد | 3 |
| المصادقة والجلسات | 12 |
| التصنيفات | 1 |
| التجارة والطلبات والمتاجر | 3 |
| الاكتشاف والرئيسية | 10 |
| الرسائل | 12 |
| الإشعارات | 2 |
| الطلبات والعروض | 1 |
| المبيعات | 2 |
| الخدمات ومقدموها | 3 |
| المشاركة والروابط | 4 |
| القصص | 1 |
| **الإجمالي** | **68** |

### 2.4 جرد مسارات الشاشة

المخزون التالي مشتق من ملفات `.ts` و`.tsx` في `app` باستثناء `_layout.tsx`. أسماء المعاملات الديناميكية تمثل مسارات ديناميكية في Expo Router.

**السوق والاكتشاف (31):**

`/`, `/explore`, `/search`, `/ads`, `/ads/:id`, `/categories`, `/categories/:id`, `/products`, `/products/:id`, `/product-categories`, `/stores`, `/stores/:id`, `/store/:slug/stats`, `/store-collections-public`, `/services`, `/services/:id`, `/service-types`, `/service-providers`, `/service-providers/:id`, `/requests`, `/requests/:id`, `/collections/:id`, `/stories`, `/stories/:id`, `/trending`, `/promoted`, `/sellers-ranking`, `/following-feed`, `/for-you`, `/suggestions`, `/shared`.

**المحادثات (2):**

`/messages`, `/messages/:id`.

**الحساب والهوية والخصوصية (27):**

`/account`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/complete-profile`, `/profile`, `/profile/:id`, `/profile/:id/followers`, `/profile/:id/following`, `/following`, `/followed-stores`, `/favorites`, `/saved-searches`, `/saved-offline`, `/saved-payments`, `/notifications`, `/settings`, `/activity`, `/sessions`, `/blocked-users`, `/delete-account`, `/report/:targetType/:targetId`, `/storage`, `/offline-queue`, `/story-create`.

**الإعلانات والتجارة وإدارة البائع (29):**

`/add`, `/ad-editor`, `/my-ads`, `/my-products`, `/my-services`, `/my-requests`, `/my-offers`, `/my-sales`, `/my-reports`, `/my-store`, `/my-stores`, `/my-store-analytics`, `/seller-dashboard`, `/seller-orders`, `/seller-profile`, `/product-editor`, `/service-editor`, `/service-images`, `/orders`, `/orders/:id`, `/order-checkout`, `/order-confirmation`, `/sale-create`, `/sales/:id`, `/sales/:id/receipt`, `/customers`, `/debts`, `/installments`, `/request-create`.

**الخدمات والمواعيد وإدارة المتجر (13):**

`/appointment-create`, `/appointments`, `/service-requests`, `/service-requests/:id`, `/service-provider-analytics`, `/service-provider-hours`, `/service-provider-profile`, `/service-reviews`, `/store-collections`, `/store-hours`, `/store-invites`, `/store-promotions`, `/store-team`.

**المجموع: 102 مسارًا.**

### 2.5 مخزون الأنماط التفاعلية

الأرقام التالية عدد ملفات المصدر التي تحتوي على النمط، وليست عدد عناصر الواجهة أو عدد الحالات وقت التشغيل:

| النمط | ملفات المصدر |
|---|---:|
| `TextInput` | 20 |
| `Pressable` | 98 |
| `FlatList` | 43 |
| `ScrollView` | 24 |
| `RefreshControl` | 28 |
| `Modal` | 3 |
| `ActionSheet` | 3 |
| `EmptyState` | 20 |
| `ErrorState` | 21 |
| `LoadingState` | 19 |
| `KeyboardAvoidingView` | 14 |
| `SafeAreaView` | 37 |

لم يظهر مكوّن `BottomSheet` مستقل في شجرة المصدر؛ توجد بنية `ActionSheet` ونوافذ أصلية/مشروطة في الشاشات.

## 3. نتائج التدقيق حسب الأولوية

### P1 — عالية

**غياب دعم ثيم داكن متكامل.**

- الدليل: `apps/mobile/src/theme/tokens.ts` يعرّف لوحة فاتحة ثابتة؛ لم يظهر استخدام `useColorScheme` أو `Appearance` في شجرة التطبيق.
- الدليل الإضافي: `apps/mobile/app/_layout.tsx:136` يثبت `StatusBar` على `style="dark"`.
- الأثر: إعداد الثيم الداكن في الجهاز لا يغيّر ألوان التطبيق. لم أضف تبديلًا شكليًا جزئيًا لأن ألوانًا كثيرة تُستهلك في `StyleSheet.create` خارج المكوّنات؛ تبديل رمز شريط الحالة وحده قد يؤدي إلى تباين غير صحيح. يتطلب ذلك ترحيلًا حقيقيًا منظمًا للثيم عبر الشاشات.
- الحالة: **قيد المعالجة / لم يُنفذ في هذه الدفعة**.

**تفاوت إظهار وجهات البائع ومقدم الخدمة.**

- الدليل: `apps/mobile/src/lib/navigation-policy.ts` يعرّف سياسة المصادقة للوجهات، بينما `apps/mobile/src/components/MobileDrawer.tsx` يعرض `DRAWER_ITEMS` ويعتمد على `getRouteAccess` لمعالجة تسجيل الدخول فقط.
- المقارنة: `apps/mobile/app/account.tsx` يجلب ملف المتجر ومقدم الخدمة ويستخدم `canShowStoreItem` لإخفاء بعض وجهات الإدارة وفق وجود النشاط.
- الأثر: قد تظهر في الدرج وجهات تجارية قبل أن تكون ملائمة لحساب المستخدم، رغم أن صفحة الحساب أكثر دقة.
- الحالة: **ملاحظة مؤكدة؛ لم أضف طلبات شبكة جديدة أو تخمينًا لصلاحيات الأدوار**. الحل الآمن هو مشاركة حالة صلاحيات المتجر/مقدم الخدمة بين الحساب والدرج مع كاش/مصدر واحد.

### P2 — متوسطة وعالية الأثر على الاستخدام اليومي

**تكرار طلب الخدمات في الرئيسية وتحميل الأقسام الثانوية مبكرًا.**

- الدليل قبل التعديل: `apps/mobile/app/index.tsx` كان يستخدم `useHomeServices`، وفي الوقت نفسه `HomeMarketplaceSections.tsx` ينفذ `fetchServiceListings`.
- الدليل الحالي بعد التعديل: `index.tsx` لم يعد يستورد `useHomeServices`، ويستخدم `onViewableItemsChanged` لتركيب الأقسام عند ظهور صف `sections`، بينما المكوّن الفرعي يحمل نسخ الكاش أولًا ويحدّث أقسام المنتجات والخدمات والطلبات بتسلسل بدل إطلاقها معًا.
- الحالة: **تم الإصلاح**. يحتفظ التحديث اليدوي بتجاوز TTL بعد ظهور الأقسام، ويُتجنب تشغيل refresh إضافي قبل تركيبها.

**خلل انعكاس RTL المزدوج.**

- الدليل قبل التعديل: 7 استعمالات `flexDirection: 'row-reverse'` في `account.tsx` و`search.tsx` و`ConversationMessageRow.tsx` و`ProductCard.tsx`، مع تفعيل RTL الأصلي في `_layout.tsx:118-126`.
- الأثر: ترتيب العناصر قد ينعكس مرتين بالنسبة لاتجاه التطبيق الأصلي.
- الحالة: **تم الإصلاح**؛ لا توجد استعمالات `row-reverse` متبقية تحت `app` أو `src`.

**أهداف لمس أصغر من 44dp.**

- الدليل قبل التعديل: `sizes.chipHeight` كان 36 و`chipHeightLg` كان 40 في `src/theme/tokens.ts`؛ إجراءات الرسالة الفاشلة 40dp تقريبًا؛ أزرار إجراءات المحادثة كانت 32dp؛ وشرائح البحث وزر التنفيذ 36dp.
- الحالة: **تم الإصلاح للعناصر المرصودة**: tokens الشرائح أصبحت 44/48، وإجراءات المحادثة/الرسالة وشرائح البحث وزر البحث 44dp على الأقل. لم أجر قياسًا بصريًا فعليًا لكل عنصر مخصص على الأجهزة.

**تباين الحدود التفاعلية.**

- الدليل قبل التعديل: `controlBorder` لم يحقق 3:1 على السطح الفاتح، وكانت بعض الحقول والشرائح وأزرار الحدود تستخدم `borderStrong` الأفتح.
- التعديل: `controlBorder` أصبح `#7E8C82`، وربطت به الحقول والبحث والشرائح والأزرار الحدودية في الأنماط المشتركة والشاشات التي تمت مراجعتها.
- نتيجة الحساب البرمجي: `controlBorder/surface = 3.52:1`، و`controlBorder/canvas = 3.35:1`؛ تحقق مدقّق الوصولية من الحد 3:1.
- الحالة: **تم الإصلاح للعناصر التي راجعتها**، ولا يمثل ذلك تدقيق تباين شاملًا لكل النصوص والوسائط في كل شاشة.

### P3 — تحسينات وصولية واتساق

- `PrimaryButton` صار يعلن `accessibilityLabel` ويعلن `busy` بالإضافة إلى `disabled`.
- أضيفت أسماء عربية واضحة لأزرار إعادة محاولة/حذف الرسائل الفاشلة، وأصبحت أهدافها 44×44dp على الأقل.
- زاد هدف إجراءات المحادثة من 32 إلى 44dp في الارتفاع والعرض.
- زاد حد عنصر تشغيل/فتح المرفقات في رسالة المحادثة إلى 44dp.
- حُسّنت حدود حقول تسجيل الدخول والبحث والإعدادات ومحرر الرسائل والأنماط العامة إلى `controlBorder`.

### تنظيف معماري صغير

- `apps/mobile/src/storage/draft-operation-queue.ts` كان تنفيذًا موازيًا غير مستخدم.
- الاستيراد الفعلي في `ad-draft-store.ts` والاختبارات يستعمل `draft-operation-queue.mjs`، كما ينص `src/storage/README.md` على أن MJS هو مصدر التنفيذ الوحيد.
- الحالة: **حُذف الملف المكرر**، ولم تتغير واجهة الدالة أو سلوك الطابور؛ اختبارات Node التي تستورد MJS بقيت ناجحة.

## 4. شرح قبل/بعد

| المجال | قبل | بعد |
|---|---|---|
| تحميل الرئيسية | مساران يحمّلان الخدمات، وأقسام السوق الثانوية قد تبدأ مبكرًا | مصدر واحد لبيانات الخدمات في الأقسام، وتركيب مؤجل حتى الظهور |
| الشبكة الضعيفة | طلبات أقسام المنتجات/الخدمات/الطلبات تنطلق معًا | طلبات متسلسلة مع تحديث جزئي لكل قسم وكاش محلي أولًا |
| RTL | 7 صفوف معكوسة يدويًا فوق `forceRTL` | اتجاه أصلي واحد باستخدام `row` |
| شرائح التحكم | 36/40dp | 44/48dp |
| إجراءات الرسائل | أهداف لمس صغيرة وتسميات وصولية ناقصة | أهداف 44dp وأسماء عربية واضحة وإعلان حالة الانشغال |
| تباين الحقول | حدود فاتحة لا تحقق 3:1 | token حدود مخصص يحقق 3:1 على الأسطح المحددة |
| طابور المسودات | ملفا تنفيذ `.ts` و`.mjs` رغم الاعتماد على MJS | تنفيذ MJS واحد متوافق مع الاستيرادات والاختبارات |

## 5. الملفات المعدلة

**ملفات التطبيق:**

- `apps/mobile/app/account.tsx`
- `apps/mobile/app/index.tsx`
- `apps/mobile/app/login.tsx`
- `apps/mobile/app/messages/[id].tsx`
- `apps/mobile/app/search.tsx`
- `apps/mobile/app/settings.tsx`
- `apps/mobile/src/components/ui/Button.tsx`
- `apps/mobile/src/components/ui/ProductCard.tsx`
- `apps/mobile/src/components/ui/styles.ts`
- `apps/mobile/src/features/discovery/HomeMarketplaceSections.tsx`
- `apps/mobile/src/features/messaging/ConversationListItem.tsx`
- `apps/mobile/src/features/messaging/ConversationMessageRow.tsx`
- `apps/mobile/src/theme/tokens.ts`

**مدقّقات التحقق:**

- `apps/mobile/scripts/verify-design-system-a11y.mjs` — تعديل التحقق ليتعامل مع شريحة البحث كمكوّن مشترك واحد بدل اشتراط تكرار خاصية الوصولية في كل استعمال.
- `apps/mobile/scripts/verify-mobile-critical-contracts.mjs` — تحديث اختبار مساري fallback ليأخذ `cacheEpochAtRequestStart` بالحسبان، والتحقق من تعطيل Sentry دون DSN ومن عدم إرسال PII الافتراضي وحذف ترويسات الطلب قبل الإرسال.

**ملف محذوف:**

- `apps/mobile/src/storage/draft-operation-queue.ts` — تنفيذ زائد مثبت عدم استخدامه؛ بقي `.mjs` وملف تعريف الأنواع `.d.mts`.

**ملف أضيف:**

- `apps/mobile/docs/MOBILE-UI-UX-AUDIT-2026-11-10-AR.md` — هذا التقرير.

## 6. فحوص التحقق ونتائجها

### نجحت فعليًا

| الفحص | النتيجة |
|---|---:|
| اختبارات Node لطبقة التخزين `src/storage/__tests__/*.test.mjs` | **40/40 ناجحة** |
| `verify-navigation-policy.mjs` | ناجح: 23 وجهة سياسة معلنة و102 مسار Expo مفحوص |
| `verify-design-system-a11y.mjs` | **13/13 ناجحة** |
| `verify-chat-pagination-audit.mjs` | ناجح |
| `verify-chat-live-stream-audit.mjs` | ناجح |
| `verify-offline-first-all-creations.mjs` | ناجح |
| `verify-mobile-critical-contracts.mjs` | ناجح بعد تحديث مطابق للكود الحالي |

### تعذر تشغيلها في بيئة الأرشيف

- `npm run type-check`: فشل قبل فحص التطبيق لأن `expo/tsconfig.base` غير موجود دون تثبيت اعتماديات Expo، كما أن `tsc` العالمي المتاح 5.8.3 بينما إعداد المشروع يستخدم خيارًا يحتاج إصدار TypeScript المتوافق مع `~6.0.3`.
- `npm run test`: تعذر التشغيل لأن `vitest` غير مثبت (`vitest: not found`).
- `npm run lint`: تعذر التشغيل لأن `eslint` غير مثبت (`eslint: not found`).
- لم يتوفر Android Emulator أو جهاز متصل لتنفيذ اختبار فعلي للأبعاد والاتجاه والكيبورد والحالات الضوئية.

### مدقّقات قديمة لا تعكس شكل التنفيذ الحالي

عند تشغيل مجموعة من مدقّقات `verify-*` القديمة ظهر أن بعضها ما زال يتوقع تفاصيل قديمة، لا أن سلوك الشاشة قد ثبت تعطله: `verify-homepage-marketplace-sections` يتوقع تركيب المكوّن بلا `refreshKey` وتسميات/حدود طلب قديمة؛ `verify-homepage-community-sections` يتوقع حد طلب 6 بدل جلب 10 ثم عرض 6؛ `verify-homepage-mixed-removal-navigation` يتوقع استدعاء جلب الإعلانات داخل ملف الصفحة بدل hook `useHomeAds`؛ `verify-conversation-virtualization` يتوقع استيراد Pressable الأصلي في قائمة الاستيراد نفسها رغم استخدام `AccessiblePressable`؛ `verify-chat-persistent-outbox-audit` يتوقع ثابتًا محليًا `MAX_PENDING = 50` بينما الحد مركزي في `src/storage/outbox/constants.ts`؛ و`verify-navigation-drawer` يتوقع 48dp بينما صفوف الدرج 50dp. لم أحتسب هذه الاختبارات فحوصًا ناجحة.

## 7. الأداء والعمل دون اتصال

- `AppImage` يستخدم `expo-image` مع `cachePolicy="memory-disk"` وتحول قصير؛ لم أضف مكتبة صور جديدة.
- صفحة الرسائل تستخدم `FlatList` مع مفاتيح مستقرة وترقيم صفحات؛ فحص الترقيم والمجرى الحي اجتاز.
- الاتصال المركزي موجود في `src/lib/connectivity.tsx`، وتستخدم ميزات المزامنة `useOnlineResync` بدل إنشاء مستمع مستقل لكل ميزة.
- كاش الرئيسية موجود مسبقًا؛ التعديل يقرأ اللقطات قبل الشبكة ويحافظ على TTL البالغ 15 دقيقة لأقسام السوق الثانوية.
- لا يمكن إعطاء رقم أداء فعلي (زمن/استهلاك ذاكرة/حجم APK) دون تشغيل التطبيق على جهاز وقياسه. التحسن في الطلبات هنا معماري/عددي: إزالة طلب خدمات مكرر، وعدم بدء تحميل الأقسام الثانوية قبل ظهورها، وتقليل التوازي إلى تسلسل في هذا الجزء من الرئيسية.

## 8. ما بقي مطلوبًا قبل اعتماد الإصدار

1. تنفيذ ثيم داكن حقيقي لجميع الشاشات والمكوّنات، مع ضبط StatusBar وفق الثيم بعد اكتمال لوحة الألوان الداكنة.
2. مشاركة صلاحيات المتجر/مقدم الخدمة بين الدرج وصفحة الحساب حتى لا تظهر وجهات غير ملائمة، دون إضافة طلبات متكررة.
3. مراجعة يدوية لكل مسار من 102 مسارًا على Android، خصوصًا نماذج الإدخال، Safe Areas، الرجوع، النوافذ، ومرفقات الرسائل.
4. تشغيل اختبارات Vitest وESLint وTypeScript بعد تثبيت lockfile dependencies المطابقة للمشروع.
5. اختبار 320/360/390/430dp، العربية/الإنجليزية والمحتوى المختلط، الضوء/الظلام، الضيف/المستخدم/البائع/مقدم الخدمة، والشبكة البطيئة/المنقطعة على جهاز أو Emulator.
6. تحديث مدقّقات `verify-*` القديمة المتبقية لتتحقق من العقود والسلوك بدل مطابقة أسماء متغيرات أو مواضع استيراد سابقة.

**الخلاصة:** هذه الدفعة تنفّذ مجموعة إصلاحات مؤكدة ومحددة في RTL والوصولية وتكلفة تحميل الصفحة الرئيسية وتجربة الرسائل، وتحافظ على طبقات البيانات والمزامنة الحالية. لا ينبغي اعتبارها اعتمادًا نهائيًا لكل الشاشات أو بديلًا عن اختبارات الجهاز والثيم الداكن.
