# تقرير تنفيذ إغلاق فجوات Web–Mobile — MarketPlat

**التاريخ:** 30 أكتوبر 2026  
**نطاق الحزمة:** الملفات الجديدة والمعدّلة فقط، مع الحفاظ على مساراتها داخل المستودع.  
**مصدر العمل:** نسخة `marketplat-uiux-improved-2026-10-30.zip` وتقرير تدقيق التوافق بين الويب والموبايل.

## خلاصة التنفيذ

نفّذت مجموعة تعديلات فعلية في تطبيق Expo/React Native وخدمات API المرتبطة بالميزات، بدل الاكتفاء بخطة أو نموذج شكلي. الحزمة تحتوي على **24 ملفًا جديدًا و26 ملفًا معدّلًا**، دون حذف ملفات من المشروع الأصلي.

### ما نُفّذ

- **تفاصيل المنتج:** معرض متعدد الصور مع عرض ملء الشاشة والعداد؛ مفضلة مرتبطة بـ API الموجود؛ عرض السمات الديناميكية؛ وسائل الدفع بصيغة عامة لا تكشف رقم الحساب أو اسم صاحبه؛ مشاهدات وتاريخ وتقييمات عند توافرها؛ منتجات من المتجر وتوصيات؛ نصائح سلامة وزر مشاركة.
- **تفاصيل الإعلان:** معرض موحّد، مشاهدات/تاريخ عند توافرهما، حفظ صريح دون اتصال منفصل عن الكاش العام، نصائح السلامة ومشاركة.
- **طلبات الخدمات:** شاشة تفاصيل مستقلة تتضمن الوصف الكامل والصور والسعر/العرض والموعد والحالة والتسلسل الزمني والإجراءات المعتمدة على الدور؛ ضغط بطاقة الطلب يفتح الشاشة. أزيل القبول السريع من القائمة كي لا يتجاوز مسار عرض السعر والموافقة.
- **واجهة المتجر:** ستة تبويبات: المنتجات، العروض، المجموعات، الإعلانات، التقييمات، وعن المتجر؛ تحميل الأقسام حسب اختيار التبويب بدل استدعاء كل قسم في كل بطاقة.
- **البحث:** حفظ البحث والفلاتر، نوع المحتوى، شرط حالة الإعلان `NEW/USED/REFURBISHED` عندما يدعمه المسار، وتصفح النتائج على صفحات.
- **الحساب:** إدارة الجلسات، حذف الحساب مع تأكيد وإعادة إدخال كلمة المرور، قائمة المتابَعين، المحفوظات الصريحة دون اتصال، صفحة كل الإعلانات، ولوحة بائع خفيفة، وروابط الصفحات القانونية.
- **الاكتشاف والواجهة:** مسار «مخصّص لك» يعيد استخدام موجز التوصيات الموجود دون طلبات احتياطية زائدة، وبطاقة منتج مشتركة ومكوّنات مشتركة للمفضلة والمعرض والنجوم والمشاركة والفلاتر والتبويبات والتسلسل الزمني والأمان.
- **الهوية:** توحيد tokens الدلالية للألوان والمسافات والزوايا والظلال، الإبقاء على الوضع الفاتح، وتحديث خلفية إعدادات Expo لتتوافق مع لون السطح.
- **سلامة API:** تنقية بيانات وسائل الدفع في استجابات المنتجات العامة، بما في ذلك البيانات التي قد تكون آتية من الكاش؛ وإصلاح انتقال حالة طلب الخدمة بين قبول عرض السعر وبدء التنفيذ؛ إضافة مسار حذف حساب محمي بإعادة التوثيق للحسابات ذات كلمة المرور.

## الملفات الجديدة (24)

- `apps/mobile/app/ads.tsx`
- `apps/mobile/app/delete-account.tsx`
- `apps/mobile/app/following.tsx`
- `apps/mobile/app/for-you.tsx`
- `apps/mobile/app/saved-offline.tsx`
- `apps/mobile/app/seller-dashboard.tsx`
- `apps/mobile/app/service-requests/[id].tsx`
- `apps/mobile/app/sessions.tsx`
- `apps/mobile/scripts/verify-web-mobile-parity.mjs`
- `apps/mobile/src/components/ui/AccountSecuritySection.tsx`
- `apps/mobile/src/components/ui/FavoriteButton.tsx`
- `apps/mobile/src/components/ui/FilterChip.tsx`
- `apps/mobile/src/components/ui/MediaGallery.tsx`
- `apps/mobile/src/components/ui/ProductAttributeList.tsx`
- `apps/mobile/src/components/ui/ProductCard.tsx`
- `apps/mobile/src/components/ui/RatingStars.tsx`
- `apps/mobile/src/components/ui/SaveOfflineButton.tsx`
- `apps/mobile/src/components/ui/SemanticIcon.tsx`
- `apps/mobile/src/components/ui/ServiceRequestTimeline.tsx`
- `apps/mobile/src/components/ui/ShareButton.tsx`
- `apps/mobile/src/components/ui/StorefrontTabs.tsx`
- `apps/mobile/src/features/account/delete-account.api.ts`
- `apps/mobile/src/features/auth/sessions.api.ts`
- `apps/mobile/src/storage/saved-offline.ts`

## الملفات المعدّلة (26)

- `apps/api/src/modules/products/products.service.ts`
- `apps/api/src/modules/service-requests/service-requests.service.ts`
- `apps/api/src/modules/users/users.controller.ts`
- `apps/api/src/modules/users/users.routes.ts`
- `apps/api/src/modules/users/users.service.ts`
- `apps/api/src/modules/users/users.validation.ts`
- `apps/mobile/app/ads/[id].tsx`
- `apps/mobile/app/index.tsx`
- `apps/mobile/app/products/[id].tsx`
- `apps/mobile/app/search.tsx`
- `apps/mobile/app/service-requests.tsx`
- `apps/mobile/app/settings.tsx`
- `apps/mobile/app/stores/[id].tsx`
- `apps/mobile/app.json`
- `apps/mobile/scripts/verify-design-system-a11y.mjs`
- `apps/mobile/scripts/verify-feature-store-pages.mjs`
- `apps/mobile/scripts/verify-stories-deep-links-phase3.mjs`
- `apps/mobile/src/components/ui/index.ts`
- `apps/mobile/src/features/account/saved-searches.api.ts`
- `apps/mobile/src/features/ads/ads.api.ts`
- `apps/mobile/src/features/ads/favorites.api.ts`
- `apps/mobile/src/features/commerce/commerce.api.ts`
- `apps/mobile/src/features/discovery/DiscoveryFeedScreen.tsx`
- `apps/mobile/src/features/discovery/discovery.api.ts`
- `apps/mobile/src/features/services/services.api.ts`
- `apps/mobile/src/theme/tokens.ts`

## التحقق المنفّذ

- `node scripts/run-all-verifications.mjs` من مجلد `apps/mobile`: **63/63** اختبارات تحقق ثابتة ناجحة.
- `node --test src/storage/__tests__/*.test.mjs`: **30/30** اختبارات ناجحة.
- تحليل TypeScript/TSX نحوي عبر TypeScript compiler API: **45 ملفًا معدّلًا/جديدًا اجتازت التحليل النحوي**.
- تحقق التباين وإمكانية الوصول المضمّن في مجموعة التحقق: نجاح نسب التباين التي تم فحصها، ومنها نص العلامة التجارية على الأبيض **4.83:1**، ونص التحذير على خلفيته **7.10:1**؛ وأهداف اللمس وخصائص التبويب متحقّق منها في الاختبارات الثابتة.
- سلامة أرشيف ZIP تم التحقق منها بعد إنشائه.

### فحص لم يمكن اعتماده

لم يكتمل `npm run type-check` أو بناء Android/iOS. السبب أن النسخة العاملة لا تحتوي على `node_modules`، ولم يُحلّ `expo/tsconfig.base`، لذلك ظهرت أخطاء بيئة واعتماديات مثل عدم العثور على `react` و`react-native` و`expo-router`؛ **لا يجوز اعتبار هذا فشل أنواع ناتجًا عن التعديلات وحدها، ولا يجوز كذلك اعتبار فحص الأنواع ناجحًا**. ينبغي تثبيت الاعتماديات وفق مدير الحزم/القفل الرسمي ثم إعادة فحص الأنواع والبناء.

## المتبقي المعروف — لا أدّعي اكتماله

1. **الخطوط Cairo وIBM Plex Sans Arabic:** لم تُضمَّن ملفات خطوط مرخّصة/محلية في المصدر. يحتاج إكمال ذلك إلى توفير ملفات الأوزان المطلوبة ثم تحميلها عبر `expo-font` في نقطة بدء التطبيق والتحقق من الخطوط على Android/iOS. لم أضع أسماء خطوط غير موجودة أو مسارات أصول وهمية.
2. **Lucide icons:** لم أضف `lucide-react-native` أو `react-native-svg` إلى الاعتماديات/القفل؛ فالمشروع لا يحتوي حاليًا على هذين الاعتمادين المباشرين، وتغييرها دون تثبيت متحقق منه سيترك المشروع غير قابل للبناء. `SemanticIcon` هو طبقة موحّدة فوق محوّل الأيقونات القائم، وليس ادعاءً بأن كل الرموز أصبحت Lucide.
3. **Google OAuth وإكمال الملف الشخصي للموبايل:** مسار حذف الحساب يتطلب كلمة المرور ويرفض الإتمام صراحةً إذا كان الحساب OAuth-only، لأن إعادة توثيق Google وإعادة تبادل الجلسة عبر deep link غير متاحة ضمن التدفق المحمول الحالي. يلزم تنفيذ OAuth آمن باستخدام حزمة المصادقة المعتمدة وتأكيد API قبل تفعيل الحذف لهذه الحسابات.
4. **الاختبار على جهاز فعلي:** لم يمكن تشغيل Expo app أو مقارنة لقطات فعلية، لذا لا أصف المقارنة البصرية بأنها pixel-perfect. اختبارات التحقق هنا ثابتة/ساكنة.
5. **الحقول الاختيارية:** تاريخ النشر والمشاهدات والتقييم ووسائل الدفع/السمات لا تعرض إلا عندما ترجع فعليًا من API. لا تُولّد قيم افتراضية مضللة.

## خطة التنفيذ المقترحة بالترتيب

### Quick wins — منجزة في هذه الحزمة

1. Tokens الدلالية ومكوّنات UI المشتركة.
2. تحسين تفاصيل المنتج والإعلان والمعرض والمشاركة والمفضلة والحفظ دون اتصال.
3. استكمال تبويبات المتجر الستة.
4. حفظ البحث وفلاتر الإعلان وحالة المحتوى والتصفح المرقّم.
5. تفاصيل طلب الخدمة وربط قائمة الطلبات بها.
6. صفحات الجلسات والمتابَعين والمحفوظات دون اتصال والإعلانات ولوحة البائع والصفحات القانونية.
7. تنقية الاستجابة العامة لوسائل الدفع وإعادة التوثيق لكلمة المرور قبل حذف الحساب.

### المرحلة التالية — مطلوبة قبل إصدار إنتاجي

1. تثبيت الاعتماديات من ملف القفل الرسمي، ثم `npm run type-check` وبناء Expo Android/iOS وإصلاح أي أخطاء فعلية تظهر.
2. توفير ملفات Cairo وIBM Plex Sans Arabic بأوزان مناسبة وربطها بـ `expo-font` واختبار fallback RTL.
3. اعتماد `lucide-react-native` و`react-native-svg` وتحديث القفل عبر مدير الحزم المعتمد، ثم استبدال glyphs تدريجيًا واختبار حزم native.
4. تصميم OAuth mobile + deep-link/session exchange وإعادة توثيق Google، ثم اختبارات استرداد/إلغاء الجلسة وحذف الحساب.
5. اختبارات تكامل على خادم تجريبي وجهازين على الأقل: صلاحيات طلب الخدمة، الوسائل العامة للدفع، pagination، حفظ offline، ولقطات RTL/إمكانية الوصول.

## قائمة تحقق

- [x] تفاصيل المنتج: معرض/مفضلة/سمات/دفع آمن/بيانات اختيارية/توصيات/سلامة/مشاركة.
- [x] تفاصيل الإعلان: معرض/حفظ صريح دون اتصال/سلامة/مشاركة.
- [x] شاشة طلب الخدمة المستقلة وربط القائمة والإجراءات حسب الدور.
- [x] تبويبات المتجر الستة.
- [x] حفظ البحث وفلتر الحالة حسب دعم API وفلاتر حسب نوع المحتوى.
- [x] إدارة الجلسات، الحذف المعاد توثيقه بكلمة مرور، المتابَعون، الصفحات القانونية.
- [x] صفحة كل الإعلانات ولوحة البائع ومسار «مخصّص لك».
- [x] مكوّنات UI المشتركة وtokens والاحتفاظ بالوضع الفاتح.
- [x] معالجة أمان استجابة وسائل الدفع العامة.
- [x] 63/63 تحقق ثابت و30/30 اختبار تخزين والتحليل النحوي لـ45 ملفًا.
- [ ] فحص أنواع كامل بعد تثبيت dependencies الرسمية.
- [ ] بناء واختبار Android/iOS فعلي.
- [ ] ملفات الخطوط وربط `expo-font`.
- [ ] ترقية الأيقونات إلى Lucide بعد اعتماد الحزم وتحديث lockfile.
- [ ] OAuth mobile وإعادة توثيق حسابات Google-only.
- [ ] اختبار بصري ويدوي على أجهزة فعلية.

## طريقة تطبيق الحزمة

فكّ ضغط الحزمة في **جذر مستودع MarketPlat** مع السماح باستبدال الملفات المعدّلة. الأرشيف يحتوي فقط على الملفات الجديدة/المعدّلة مع مسارات `apps/mobile/...` و`apps/api/...`، ولا يحتوي `node_modules` أو أسرارًا أو ملفات بناء مولّدة. راجع هذا التقرير قبل النشر، ثم ثبّت الاعتماديات وفق القفل الرسمي وشغّل فحوص الأنواع والبناء.
