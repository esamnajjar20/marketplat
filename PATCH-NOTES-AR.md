# MarketPlat — إغلاق ملاحظات الصفحات والمكونات المتبقية (باستثناء الرئيسية)

**التاريخ:** 30 أكتوبر 2026  
**نوع التسليم:** حزمة incremental — تُطبّق فوق حزمة `marketplat-web-mobile-parity-implementation-2026-10-30.zip` السابقة، ولا تحتوي على ملفات الصفحة الرئيسية.

## ملخص التنفيذ

تم إغلاق الملاحظات التي يمكن تنفيذها بأمان باستخدام عقود المشروع الحالية:

1. **المحفوظات المحلية للدفع:** شاشة `/saved-payments` مع الإضافة والتعديل والبحث والحذف المؤكد. التخزين عبر قاعدة SQLCipher الحالية، ومقيد بمعرف الحساب. أضيفت جداولها إلى تنظيف البيانات الخاصة عند تسجيل الخروج؛ لا تُخزن كلمات مرور أو CVV أو أرقام بطاقات كاملة.
2. **استقبال المشاركة:** شاشة `/shared` تفك payload الإصدار 1 المتوافق مع `frontend/lib/shareQr.ts` من `marketplat://shared#d=...`، مع حالات فارغ/تالف/صالح وحد أقصى لحجم payload. أضيف helper لمشاركة payload عبر المسار الأصلي.
3. **إحصاءات المتجر العامة:** شاشة `/store/[slug]/stats` تستخدم نقطة النهاية العامة الموجودة `/api/v1/public/stores/:slug/stats`، مع عرض المؤشرات المسموح بها من العقد الحالي.
4. **إكمال الملف الشخصي:** شاشة `/complete-profile` تستعمل `fetchMyProfile` و`updateMyProfile`، وتحدّث حالة المستخدم المحلية بعد نجاح حفظ الاسم والمدينة. أضيفت حالة إكمال الملف في Account Hub.
5. **تعميم المكونات:** `ProductCard` في كتالوج المنتجات وصفحة المتجر، و`RatingStars` في مقدمي الخدمات وتقييماتهم والمتجر والبحث وترتيب البائعين.
6. **التنقل والإعدادات:** أضيفت روابط المحفوظات والمتابَعين ولوحة البائع إلى Account Hub، ورابط المحفوظات إلى Settings. أصبحت روابط الصفحات القانونية تعتمد `EXPO_PUBLIC_WEB_URL` مع fallback آمن إلى أصل الإنتاج.
7. **حماية التخزين:** بيانات جهات الدفع محلية فقط، account-scoped، ومشمولة بمسح البيانات الخاصة عند الخروج.

## الملفات الجديدة والمعدّلة في هذه الحزمة

- `apps/mobile/.env.example`
- `apps/mobile/app/account.tsx`
- `apps/mobile/app/complete-profile.tsx`
- `apps/mobile/app/products.tsx`
- `apps/mobile/app/saved-payments.tsx`
- `apps/mobile/app/search.tsx`
- `apps/mobile/app/sellers-ranking.tsx`
- `apps/mobile/app/service-providers/[id].tsx`
- `apps/mobile/app/service-providers.tsx`
- `apps/mobile/app/service-reviews.tsx`
- `apps/mobile/app/settings.tsx`
- `apps/mobile/app/shared.tsx`
- `apps/mobile/app/store/[slug]/stats.tsx`
- `apps/mobile/app/stores/[id].tsx`
- `apps/mobile/scripts/verify-followup-remaining-pages.mjs`
- `apps/mobile/src/features/auth/AuthContext.tsx`
- `apps/mobile/src/features/commerce/commerce.api.ts`
- `apps/mobile/src/features/sharing/deep-links.ts`
- `apps/mobile/src/features/sharing/shared-payload.ts`
- `apps/mobile/src/lib/web-links.ts`
- `apps/mobile/src/storage/public-cache.ts`
- `apps/mobile/src/storage/saved-payments.store.ts`

## ما لم أغيّره

- **الصفحة الرئيسية مستثناة بالكامل من هذه الحزمة.** لم أعدّل `apps/mobile/app/index.tsx` أو `apps/mobile/app/for-you.tsx` في هذه الجولة.
- لم أوسّع أنواع البحث المحفوظة إلى `stores` أو `all`: عقد الخادم الحالي يعرّف `ads/products/services` فقط، وتوسيعها يتطلب إضافة matching/notification semantics على الخادم، وليس تغيير TypeScript في الموبايل وحده.

## نقاط لم تُغلق — قيود حقيقية وليست أزرارًا شكلية

1. **Google OAuth الأصلي للموبايل:** الباك إند الحالي ينفذ Google OAuth عبر browser redirect ويعيد session cookies إلى موقع الويب. لا يوجد عقد native callback/one-time exchange يسلّم جلسة آمنة إلى التطبيق. لذلك أضفت شاشة إكمال الملف فقط، ولم أضف زر Google يفتح متصفحًا ثم يوهم المستخدم بأن جلسة التطبيق أصبحت موثقة. يلزم endpoint تبادل قصير العمر مرتبط بـPKCE/state وdeep-link allowlist واختبارات backend قبل تفعيل OAuth في Expo.
2. **Lucide والأيقونات:** `lucide-react-native` يحتاج `react-native-svg` وتحديث pnpm lockfile. لم تتوفر pnpm أو اعتماديات المشروع في بيئة العمل، كما أن إضافة import دون lock متوافق ستكسر frozen install. لذلك بقيت طبقة `SemanticIcon` القديمة ولم أدّعِ إغلاق تحويل Unicode إلى Lucide.
3. **Cairo وIBM Plex Sans Arabic:** ملفات الخطوط غير موجودة في أصول المشروع، وتعذر جلب ملفات binary في بيئة التنفيذ. لم أضع مراجع إلى ملفات غير موجودة داخل `useFonts` كي لا يتعطل تشغيل التطبيق. يلزم إرفاق ملفات OFL المرخصة ثم إضافة `expo-font` مباشرة وتفعيل التحميل.
4. **الروابط العامة للمشاركة:** receiver يدعم رابط التطبيق `marketplat://shared#d=...`. فتح روابط الويب `https://.../shared#d=...` تلقائيًا داخل التطبيق يتطلب إعداد Android App Links وiOS Universal Links مع ملفات domain association على الخادم؛ لم أضف association غير متحقق منها.
5. **إمكانية الوصول:** حسّنت المكونات والأسطح التي عدّلتها، لكن رقم 56/95 في التقرير السابق كان إشارة static وليست تشخيصًا لكل شاشة. لا أدّعي إغلاق تدقيق VoiceOver/TalkBack اليدوي لكل الشاشات؛ ما زال يحتاج اختبار أجهزة فعلي.
6. **فحص TypeScript والبناء:** لم يكتمل `tsc --noEmit` أو Android/iOS build بسبب عدم وجود `node_modules` وعدم حل `expo/tsconfig.base` في مساحة العمل. يجب تشغيل الفحوصات في بيئة المشروع الكاملة.

## نتائج التحقق المنفذة

- `node scripts/run-all-verifications.mjs`: **64/64** فحصًا نشطًا ناجحًا. يوجد 86 فحصًا تاريخيًا في quarantine ولم تُحسب ضمن الناجحة.
- `node --test src/storage/__tests__/*.test.mjs`: **30/30** اختبار تخزين ناجح.
- فحص التحليل النحوي TypeScript/TSX عبر TypeScript transpile API: **57 ملفًا** دون أخطاء نحوية.
- `tsc --noEmit`: **لم يكتمل**؛ السبب الموثق هو غياب اعتماديات Expo/React وعدم حل `expo/tsconfig.base`، وليس نتيجة نجاح للأنواع.
- لم يُنفذ build أصلي أو اختبار runtime على جهاز فعلي.

## طريقة التطبيق

1. تأكد من تطبيق حزمة `marketplat-web-mobile-parity-implementation-2026-10-30.zip` السابقة على نفس نسخة الأساس.
2. فك هذه الحزمة من جذر المستودع واسمح باستبدال الملفات الـ22 المدرجة.
3. أضف `EXPO_PUBLIC_WEB_URL` في بيئة Expo إلى أصل الويب (دون مسار)، ثم ثبّت الاعتماديات من lockfile الرسمي.
4. شغّل فحوصات TypeScript وlint وAndroid/iOS build واختبر SQLCipher وفتح `marketplat://shared#d=...` على جهاز فعلي.

**هذه حزمة تعديلات متبقية وليست مشروعًا كاملًا.**
