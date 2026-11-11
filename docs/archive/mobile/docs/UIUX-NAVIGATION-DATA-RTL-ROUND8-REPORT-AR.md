# تقرير استكمال UI/UX والتنقل والبيانات وRTL — الجولة الثامنة

**التاريخ:** 1 نوفمبر 2026  
**قاعدة العمل:** `marketplat-mobile-round7-critical-audit-repaired.zip`  
**النطاق المنفذ:** `apps/mobile`، خصوصًا سياسة التنقل والترقيم والتوثيق وفحوص الانحدار.

## التغييرات المنفذة

### 1. مصدر موحد للتنقل
- أضيف `src/lib/navigation-policy.ts` ليكون مصدر الحقيقة المشترك للتبويبات الخمسة، وعناصر Drawer، وربط المسارات بالتبويب النشط، وإخفاء Bottom Navigation في الشاشات التفصيلية/المحررات، والتصنيف الأولي للمسارات الخاصة.
- أصبح `BottomNavigation.tsx` يقرأ `MAIN_TABS` و`getActiveMainTab` و`shouldHideBottomNavigation` بدل امتلاك قوائم roots محلية.
- أصبح `MobileDrawer.tsx` يقرأ `DRAWER_ITEMS` من المصدر نفسه بدل تكرار تعريف القائمة.
- أضيفت وجهات موجز المتابعة وملفات البائع العامة إلى تصنيف استكشف، مع فصل `/profile` الخاص عن `/profile/:id` العام.
- أضيف فحص `verify:navigation-policy` للتأكد من أن وجهات التبويبات والقائمة الجانبية موجودة كمسارات Expo Router، وأن المكونات لا تعيد تعريف قوائم مستقلة.

### 2. عقد pagination مشترك
- أضيف `src/lib/pagination.ts` وفيه `resolvePageState` لتوحيد التعامل مع `page` و`totalPages` و`total` و`hasNextPage`.
- يعالج غياب `totalPages`: يستخدم `total` إن توفر، وإلا يعتبر الصفحة الكاملة إشارة إلى احتمال وجود صفحة تالية، والصفحة القصيرة إشارة إلى نهاية النتائج.
- نُقلت شاشة `following-feed` إلى هذا العقد بدل افتراض أن غياب `totalPages` يعني دائمًا صفحة واحدة.
- بقيت المحادثات على cursor pagination عمدًا، ولم تُحوّل إلى page pagination.

### 3. سياسة تعارضات موثقة
- أضيف `docs/APP-WIDE-UI-NAVIGATION-DATA-RTL-POLICY-AR.md` ويحدد ملكية البيانات، مفاتيح الكاش الخاصة، الإبطال الدقيق، إلغاء الطلبات، deduplication، فصل pagination العادي عن cursor، وضوابط الأوفلاين والصلاحيات.
- أضيف تقرير الجولة الحالية في `docs/UIUX-NAVIGATION-DATA-RTL-ROUND8-REPORT-AR.md`.

## قرار RTL — ما لم أدّعِ إنجازه

لم أفعّل `I18nManager.forceRTL(true)` في هذه الجولة. المشروع ما زال يعتمد على تخطيط عربي معكوس يدويًا، مع استعمال واسع لـ`row-reverse` والمحاذاة الصريحة، إضافة إلى Drawer وإيماءات وانتقالات مبنية على هذا الافتراض. تشغيل RTL الأصلي الآن قد يقلب الصفوف مرتين ويكسر اتجاه الإيماءات والانتقالات. تم توثيق سياسة تمنع التفعيل العشوائي وتحدد شروط الترحيل. لذلك **RTL الأصلي على مستوى النظام ما زال غير منجز**، ويحتاج ترحيلًا شاملاً واختبارًا بصريًا على Android وiOS، لا تغيير سطر واحد.

## حدود التنفيذ

- `getRouteAccess` تصنيف مركزي مساعد، وليس حارسًا تنفيذيًا لكل route. لم أضف redirect شاملًا لأن المسارات العامة/الخاصة متداخلة، وبعض صفحات التفاصيل عامة، وإضافة حارس غير مكتمل قد تمنع مستخدمًا من فتح بيانات عامة أو تكسر deep links. تبقى حماية API على الخادم إلزامية.
- تم نقل موجز المتابعة إلى pagination helper؛ لم تُنقل كل قوائم المشروع بعد إلى hook واحد، لأن أشكال API ومفاتيح الملكية وسياسات التحديث تختلف ويجب نقل كل مجموعة بعد تدقيق عقدها.
- لم يتم اختبار واجهة RTL أو الإيماءات على جهاز حقيقي.

## الفحوص المنفذة

نجحت في هذه الجولة:
- `verify:navigation-policy` — 23 وجهة تبويب/Drawer موجودة في Expo Router، ومصدر مشترك للقوائم.
- `verify-mobile-audit-repairs.mjs` — 31/31.
- `verify-mobile-critical-contracts.mjs`.
- `verify-design-system-a11y.mjs` — 13/13.
- `lint-mobile.mjs` — فحص المشروع المخصص لـ269 ملف TypeScript؛ ليس ESLint.
- `verify-phase2-build-config.mjs`.
- `verify-offline-first-deep-audit-fixes.mjs`.
- `verify-offline-first-public-cache.mjs`.
- `verify-release-config.mjs` — فحص إعدادات ساكن، وليس بناء Gradle أو توقيع APK.
- فحص TypeScript syntax عبر `transpileModule` للملفات السبعة المعدلة/المضافة — بلا أخطاء parsing.

## فحوص لم تُنفذ

لم يتم تشغيل `tsc --noEmit` أو ESLint الكامل أو Vitest أو `expo-doctor` أو Gradle أو إنتاج APK/AAB أو تشغيل التطبيق على محاكي/جهاز. بيئة العمل لا تحتوي تثبيت dependencies محليًا، ومحاولة استعادة مدير الحزم من الجولة السابقة لم تكن متاحة. لذلك لا أصف النسخة بأنها جاهزة للنشر أو أن RTL الأصلي اكتمل.

## الملفات الجديدة/المعدلة الأساسية

- جديد: `src/lib/navigation-policy.ts`
- جديد: `src/lib/pagination.ts`
- جديد: `src/lib/__tests__/navigation-policy.test.ts`
- جديد: `src/lib/__tests__/pagination.test.ts`
- جديد: `scripts/verify-navigation-policy.mjs`
- جديد: `docs/APP-WIDE-UI-NAVIGATION-DATA-RTL-POLICY-AR.md`
- جديد: `docs/UIUX-NAVIGATION-DATA-RTL-ROUND8-REPORT-AR.md`
- معدل: `src/components/BottomNavigation.tsx`
- معدل: `src/components/MobileDrawer.tsx`
- معدل: `app/following-feed.tsx`
- معدل: `scripts/verify-mobile-audit-repairs.mjs`
- معدل: `package.json` (أضيف أمر التحقق من سياسة التنقل)
