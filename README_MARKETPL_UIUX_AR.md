# MarketPlat — توحيد UI/UX V2

## ما تم توحيده

- اعتماد `frontend/components/shared/layout/PageHeader.tsx` كبنية عنوان صفحة مشتركة في الويب.
- إضافة Variants للعرض: `standard`, `browse`, `account`, `admin`, `detail`. الاختلاف بينها في الكثافة والسطح فقط، وليس في البنية الدلالية.
- ربط `ListPageShell` و`AccountPageShell` و`AdminPageShell` بالمكوّن نفسه.
- نقل صفحات خدماتي ومبيعاتي ولوحة المتجر إلى `AccountPageShell` بدلاً من عناوين محلية مكررة.
- تحويل `EditPageHeader` لاستخدام `PageHeader` مع الإبقاء على رابط الرجوع.
- تعريف أدوار تخطيط الصفحة في `frontend/app/globals.css`: عرض الحاوية، الهوامش، فجوات الأقسام، وحجم العنوان.
- تعريف أدوار تخطيط الشاشة في Native من خلال `layout` في `apps/mobile/src/theme/tokens.ts`، وربط `styles.ts` و`AppHeader.tsx` بها.
- إصلاح الصورة البديلة في عرض القائمة لـ `ProductCard` لاستخدام اللوحة والدالة نفسيهما اللتين تستخدمهما بطاقات MarketCard.
- إنشاء `TabsBar` موحد للتبويبات الفعلية بمظاهر underline/pills/segmented، مع دعم لوحة المفاتيح والتركيز واتجاه RTL.
- نقل تبويبات البحث والملف الشخصي والمفضلة والمتجر ومراكز الحساب والإعدادات والأوفلاين والمحفوظات إلى `TabsBar`.
- جعل `FilterChipGroup` المصدر الموحد لشرائح الفلاتر، مع مظهر pills/underline وهدف لمس لا يقل عن 44px.
- جعل `CategoryFilterChips` يعيد استخدام `FilterChipGroup` بدلاً من تنفيذ أزرار التصنيف مرة أخرى.
- توحيد شرائح الرسائل والطلبات ووسائط المحادثة والنشاط، وإزالة دلالات tablist غير المناسبة للفلاتر.
- تصحيح تبويبات تصنيفات الإدارة لتكون روابط تنقل داخل `nav` مع `aria-current` بدلاً من تمثيلها كتبديل محتوى.
- تصحيح تدقيق الصور البديلة ليقبل إعادة الاستخدام عبر MarketCard بدلاً من اشتراط استدعاء الدالة مباشرةً من كل بطاقة.
- إضافة تدقيق `uiux:unification-audit` وربطه بأمر `verify:all`، وإضافة اختبارات لمتغيرات PageHeader وحالة الصورة البديلة.

## الفحوصات المنفذة

| الفحص | النتيجة |
|---|---:|
| UI/UX Unification Audit | 24/24 |
| Design Token Contract | 23/23 |
| Responsive Visual Consistency | 18/18 |
| Card Unification Phase 4 | 12/12 |
| Web / Native Design-System Parity | 60/60 |
| Mobile Accessibility | 13/13 |
| صياغة ملفات TypeScript/TSX/MTS المعدّلة | 40/40، صفر أخطاء صياغة |
| توازن أقواس CSS وصحة package JSON | ناجح |

## فحوصات لم تُشغّل

- لم يتم تشغيل Vitest للويب؛ لا توجد `node_modules` في بيئة إعداد الحزمة.
- لم يتم تشغيل TypeScript semantic check أو Next.js Build أو Expo bundle.
- لم يتم أخذ لقطات مرئية من متصفح حقيقي أو تسجيل React Native على جهاز فعلي؛ لذلك لا توجد دعوى بأن كل الشاشات تطابق بصرياً بعد التشغيل.
- `apps/mobile/scripts/verify-theme-system.mts` ما زال يُظهر فشل Assertion متعلقاً بتوقع قديم حول `getVisibleDrawerItems` في منطق درج التنقل؛ هذا الملف ومنطق Drawer خارج نطاق هذه التعديلات ولم يتم تغييره هنا.

## أوامر الفحص بعد الدمج

```bash
npm --prefix frontend run uiux:unification-audit
npm --prefix frontend run design-system:token-audit
npm --prefix frontend run responsive:visual-audit
npm --prefix frontend run cards:unification-phase4-audit
pnpm --filter @marketplat/mobile verify:design-system-parity
pnpm --filter @marketplat/mobile verify:a11y
npm run type-check
npm run test
npm run build
```

## اختيار الحزمة

1. `marketplat-uiux-unification-v2.zip`: ملفات UI/UX المعدّلة فقط؛ طبّقها فوق نسخة المشروع التي دمجت فيها V5 السابقة.
2. `marketplat-complete-filters-cache-validation-loading-render-uiux-v6.zip`: حزمة تراكمية من المصدر الأصلي تشمل V5 وكل تعديلات UI/UX هذه. استخدمها على نسخة نظيفة من المصدر الأصلي ولا تطبقها فوق V5.

كلتا الحزمتين تحتفظان بالمسارات النسبية للمشروع. خذ نسخة احتياطية قبل الاستبدال.
