# MarketPlat — توحيد إعادة التصيير V2

## ما تم تغييره

- تفعيل React Compiler في Next.js 15.5 عبر `experimental.reactCompiler` وإضافة الإضافة المطلوبة إلى اعتماديات الويب.
- تفعيل React Compiler في Expo SDK 58 عبر `expo.experiments.reactCompiler`، مع تثبيت الاعتماد الصريح وتحديث قفل pnpm.
- تقسيم `AuthContext` في الموبايل إلى أربعة اشتراكات مستقلة: الهوية، الجلسة، الحالة، والأوامر.
- نقل مستهلكي `useAuth()` إلى أضيق Hook مناسب؛ أبقينا `useAuth()` نفسه للتوافق مع الأكواد القديمة.
- معالجة دالة تسجيل الخروج لتقرأ مالك الجلسة من `userRef` حتى تبقى دالة الأمر مستقرة عند تدوير رمز الدخول.
- إصلاح مرجع نوع المستخدم في الصفحة الرئيسية بعد تحويل Hook المصادقة.
- إضافة حدود offscreen containment لبطاقات الإعلانات والخدمات، وإصلاح بوابة تراجع التصيير.
- إضافة تدقيق `perf:render-unification-audit` إلى أدوات المشروع و`verify:all`.

## أي حزمة أستخدم؟

1. `marketplat-render-unification-v2.zip`: تغييرات التصيير فقط. استخدمها فوق نسخة المشروع التي سبق أن دمجت فيها الحزمة التراكمية V4 (Filters + Cache + Validation + Loading).
2. `marketplat-complete-filters-cache-validation-loading-render-v5.zip`: حزمة تراكمية من ملفات المصدر الأصلية، وتشمل التوحيد السابق للفلاتر والكاش والتحقق والتحميل إضافةً إلى تغييرات التصيير الحالية. استخدمها على نسخة نظيفة من المصدر الأصلي، ولا تطبقها فوق V4.

كلتا الحزمتين تحتويان على ملفات مضافة/معدّلة فقط، مع الحفاظ على المسارات النسبية. خذ نسخة احتياطية قبل الاستبدال.

## الفحوصات الممكنة في بيئة إعداد الحزمة

- `node tools/audit-rendering-unification.mjs`: ناجح.
- `node --experimental-strip-types frontend/scripts/render-regression-audit.mts`: ناجح على Node 22.16؛ على إصدار Node المطلوب للمشروع يمكن تشغيل script عبر npm مباشرةً.
- `node --experimental-strip-types frontend/scripts/render-audit.mts`: اكتمل، ويعرض مؤشرات مصدرية ثابتة فقط.
- فحص صياغة 97 ملف TS/TSX معدلاً: صفر أخطاء صياغة.
- التحقق من JSON و`pnpm-lock.yaml`: ناجح.
- نُقلت اشتراكات المصادقة إلى Hooks أضيق في 94 ملف موبايل (92 TSX وملفي TS)، مع 235 استدعاءً للـ Hooks المتخصصة. فحص أسماء الاستيراد في 367 ملف موبايل: لا توجد استيرادات Hooks غير معرّفة.

لم يتم تشغيل Build، أو TypeScript semantic check الكامل، أو Vitest، أو ESLint، أو React DevTools Profiler لغياب `node_modules` وعدم توفر Node 22.18+ وpnpm في بيئة إعداد الحزمة. لا يوجد ادعاء بتحسن رقمي في زمن التصيير قبل قياسه على تشغيل فعلي.

## تثبيت وفحص بعد الدمج

تأكد من Node `>=22.18 <25`، ثم من جذر المشروع:

```bash
corepack enable
corepack prepare pnpm@10.18.0 --activate
pnpm install --frozen-lockfile
npm ci --prefix frontend

pnpm run perf:render-unification-audit
npm --prefix frontend run perf:render-regression
npm --prefix frontend run type-check
pnpm --filter @marketplat/mobile type-check
pnpm --filter @marketplat/mobile test:all
```

ثم نفّذ Build الويب وExpo Android bundle وسجّل React DevTools Profiler لسيناريوهات تدوير token وتغيير الملف الشخصي والتنقل بين القوائم وفتح Drawer قبل مقارنة أعداد commits وأزمنة render.
