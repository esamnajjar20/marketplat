# MarketPlat — توحيد نظام Loading

## الهدف

توحيد العقد والسلوك الدلالي لحالات التحميل بين Web وMobile، مع الإبقاء على مكوّنات العرض الأصلية لكل منصة. لا يعني ذلك دمج عرض React DOM وReact Native في مكوّن UI واحد.

## التغييرات

- إضافة `packages/contracts/src/loading.ts` كمصدر مركزي وحيد لأسماء مراحل التحميل، والنصوص العربية، والقيم الزمنية الافتراضية.
- تصدير العقد من `@marketplat/contracts` وإضافة اختبارات مخصصة له.
- ربط `LoadingState` وأزرار الويب وخطّاف تأخير التحميل ومؤشر التنقل بالعقد المركزي.
- جعل `frontend/lib/loadingCopy.ts` واجهة توافقية تعيد تصدير النصوص بدلاً من تعريف نسخة ثانية.
- إضافة محوّل `Spinner` موحّد للموبايل، وحصر `ActivityIndicator` فيه بدلاً من استدعائه مباشرة داخل الأزرار.
- ربط LoadingState وأزرار الموبايل والنص الافتراضي في `COPY` بمراحل ونصوص العقد المركزي.
- استبدال حركة Skeleton/placeholder المتكررة بصنف `loading-pulse` مركزي يحترم `prefers-reduced-motion`.
- نقل صفحات تحميل المنتجات/طلبات السوق من مؤشرات Lucide المدارة يدوياً إلى حالة تحميل الزر المشتركة.
- تحديث اختبارات الواجهة التي كانت تتوقع `animate-pulse` حرفياً لتقبل رمز الحركة المركزي الجديد.
- تحديث تدقيق نظام Loading وإضافة `ux:loading-contract-audit` إلى `verify:all`.
- توثيق قواعد استخدام النظام في `frontend/docs/LOADING_SYSTEM.md` و`packages/contracts/README.md`.

## مراحل التحميل المشتركة

`initial`, `processing`, `refreshing`, `loadingMore`, `saving`, `sending`, `deleting`, `uploading`, `searching`.

ويحدد `LOADING_TIMING` القيم الافتراضية لتأخير ظهور المؤشر، وأقل مدة عرض، وتأخير Skeleton الخاص بالمسارات، وتأخير مؤشر الانتقال، ومهلة الأمان.

## طريقة الدمج

- إذا كنت قد دمجت حزمة الفلاتر والكاش والتحقق السابقة، استخدم `marketplat-loading-unification-v2.zip` فقط.
- إذا لم تدمج الحزم السابقة، استخدم `marketplat-complete-filters-cache-validation-loading-v4.zip`، وهي حزمة تراكمية تضم تغييرات الإصدار السابق مع تغييرات Loading الحالية.
- فك ضغط الحزمة المناسبة من جذر المشروع `/workspaces/marketplat` مع السماح باستبدال الملفات.

## الفحوصات المنفذة

- `node tools/audit-loading-contract.mjs`: جميع فحوصات عقد Loading ناجحة.
- `node --experimental-strip-types frontend/scripts/loading-system-audit.mts`: 53 فحصاً ناجحاً.
- `node --experimental-strip-types frontend/scripts/loading-unification-audit.mts`: 50/50 ناجحة، بما فيها 22/22 حدود تحميل المسارات.
- `node --experimental-strip-types frontend/scripts/route-navigation-loading-audit.mts`: 66 فحصاً ناجحاً.
- `cd frontend && node --experimental-strip-types scripts/feedback-motion-audit.mts`: 7/7 ناجحة.
- `node --experimental-strip-types frontend/scripts/sync-center-loading-states-audit.mts`: 10 فحوصات ناجحة.
- فحص صياغة TypeScript/TSX للملفات المتأثرة: 52 ملفاً، دون أخطاء صياغة.
- ترجمة TypeScript مع `strict` واختبارات تشغيل مستقلة للعقد الجديد: 14 تأكيداً ناجحاً.
- `package.json` صالح كـ JSON.

## ما لم يتم تشغيله

لم يتم تشغيل Build/TypeScript/Vitest/ESLint الكامل للمشروع؛ لأن `pnpm` و`node_modules` غير متوفرين في بيئة إعداد الحزمة، كما أن إصدار Node المتاح `22.16.0` أقل من الحد الأدنى المحدد في المشروع `22.18.0`. لذلك لا تُعد هذه الحزمة اجتيازاً نهائياً لفحوصات البناء الكاملة.
