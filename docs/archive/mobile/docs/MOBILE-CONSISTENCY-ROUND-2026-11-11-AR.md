# جولة توحيد الموبايل — 2026-11-11

## أولوية 1
- **ميزات غير قابلة للوصول:** `/sales-insights` (4 عروض)، `/sales-costs`، وعرض المخزون `/my-products?view=inventory` لم يكن لها أي رابط ولا تسجيل في سياسة المسارات. صارت تبويبات في `WorkspaceTabs` (مع تمييز نشط يراعي `view` وتمرير تلقائي)، ومسجّلة في `navigation-policy.ts` و`_layout.tsx` والقائمة الجانبية.
- **حالات القوائم:** `src/components/ui/ListStates.tsx` (`ListEmpty`, `ListStaleError`, `PaginatedFooter`). هُجّرت 10 شاشات: my-reports, my-requests, my-offers, followers, following, appointments, my-services, promoted, customers, debts.
- **الأوزان:** `fontWeights` في tokens؛ استُبدلت 247 قيمة حرفية في 82 ملفًا بلا تغيير بصري.
- **السحب للتحديث:** لون العلامة في 3 شاشات، وإضافة `RefreshControl` إلى 15 شاشة قائمة: blocked-users, requests, saved-searches, activity, installments, favorites, my-ads, collections/[id], store-invites, stories, categories, store-collections-public, search (عبر الخطاف الجديد `usePullRefresh` أو `reload({soft})`).
- **أحجام الخط:** حُذفت الدرجات الشاذة 19/21/23/25 ودُمجت في 18/20/22/24 (11 ملفًا).
- توثيق RTL صُحّح ليطابق الكود.

## مشكلة حرجة غير محلولة
`app/settings.tsx` يستورد 6 وحدات غير موجودة في الأرشيف المرفوع: `@/features/settings/{ThemeSection, NotificationPreferencesSection, AccountLinksSection, HelpSection, settings.styles, preferences}`. إن كانت غائبة فعلًا من مستودعك فإن Metro سيفشل في بناء الحزمة كلها. لم أُعِد كتابتها كي لا أستبدل نسختك الحقيقية إن وُجدت.

## لم يُنفَّذ (وسبب كل بند)
- **مكتبة الأيقونات:** الرموز Unicode في `Icons.tsx` متكررة المعنى (▤، ▣). يحتاج اعتمادًا جديدًا بنسخة متوافقة مع SDK 58 لا يمكن التحقق منها دون شبكة. التغيير محصور في `AppIcon`.
- **`textAlign` و`MobileDrawer`:** يحتاجان جهازًا (انظر docs/RTL-ARCHITECTURE-AR.md).
- **ملفات السطر الواحد** (stores/[id], offline-queue, messages/[id], sales-insights, my-store…): لا يوجد formatter دون تثبيت prettier.
- **فحوصات قديمة (5):** Explore→stories، إعدادات→storage/my-store، وثلاثة للإشعارات.

## التحقق
الفحوصات الثابتة: (انظر النتيجة النهائية في رسالة التسليم). فُحصت الصياغة فقط؛ لم يُشغَّل tsc/vitest/eslint ولا جهاز.
