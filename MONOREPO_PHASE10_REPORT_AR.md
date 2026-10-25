# تقرير المرحلة العاشرة — MarketPlat Monorepo

## الهدف
تقوية مسار استعادة الجلسة في تطبيق **React Native/Expo** والتحقق من توافقه مع عقد المصادقة الموجود في Express، دون تغيير الموقع أو تطبيق Capacitor.

## التغييرات
- إضافة `refreshInFlight` في `apps/mobile/src/features/auth/auth.api.ts` لتوحيد طلبات تجديد الجلسة المتزامنة داخل عملية JavaScript واحدة، وتقليل خطر سباق تدوير Refresh Cookie.
- توثيق سبب عدم إرسال CSRF header في `/api/v1/auth/refresh`: الخادم يعفي هذا المسار صراحةً من CSRF حتى يمكن استعادة الجلسة بعد إعادة تشغيل التطبيق عندما لا يملك العميل قيمة CSRF الحالية. لا يلغي ذلك اعتماد التجديد على Cookie HttpOnly التي يقرأها الخادم.
- إضافة `apps/mobile/scripts/verify-phase10.mjs` للتحقق من عقد التجديد والخروج، وخصائص Cookie، واستثناء CSRF، وعدم تخزين refresh token، واستخدام التخزين الآمن، وسلوك تنظيف الجلسة عند 401/403.
- إدراج فحص المرحلة العاشرة ضمن `pnpm --filter @marketplat/mobile test`.

## التحقق المنفذ
- `verify-scaffold.mjs` — نجح.
- `verify-phase7.mjs` — نجح.
- `verify-phase8.mjs` — نجح.
- `verify-phase9.mjs` — نجح.
- `verify-phase10.mjs` — نجح.
- `tooling/verify-workspace.mjs` — نجح.
- التحقق من ملفات JSON — نجح.
- فحص سلامة ZIP — مطلوب بعد إنشاء الأرشيف.

## حدود التحقق
الفحوصات الجديدة ثابتة/ساكنة وتقرأ عقود الكود؛ ليست اختبارات تكامل حيّة. لا توجد `node_modules` ولا `pnpm-lock.yaml` في هذه الحزمة، ولذلك لم يُشغّل TypeScript أو Expo Doctor أو Metro، ولم يُبنَ APK/IPA. لم يتم اختبار استمرار Cookie على Android أو iOS.

## مخاطر ومتابعة
- يلزم اختبار Cookie jar وCORS على Android وiOS مع عنوان API الفعلي.
- إذا لم يحتفظ `fetch` الأصلي بملفات Cookie ويرسلها كما يتطلب الخادم، فلا ينبغي حل ذلك بكشف refresh token داخل التخزين؛ يجب عندها تصميم تدفق جلسة أصلي آمن من جهة الخادم.
- المرحلة التالية يجب أن تضيف اختبارات وظيفية قابلة للتشغيل بعد تثبيت الاعتمادات، ثم تحقق TypeScript والبناء الأصلي قبل ادعاء الجاهزية.

## الحفاظ على المشروع
هذه المرحلة تخص `apps/mobile` ووثائق Monorepo فقط؛ لا تستبدل تطبيق React Native بمشروع Capacitor، ولا تحذف موقع Next.js أو Express API أو تطبيق Capacitor الحالي.
