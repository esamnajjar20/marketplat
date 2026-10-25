# تقرير إصلاحات التدقيق — الجولة الأولى

التاريخ: 2026-10-24

## ما تم تعديله

1. **اختبار تكامل الأوفلاين `apps/web/e2e/tests/offline-phase8.integration.spec.ts`**
   - أصبح ينتظر تسجيل Service Worker وسيطرته على الصفحة قبل فصل الشبكة.
   - أعيدت الشبكة داخل `finally` حتى لا يبقى سياق الاختبار Offline إذا فشل assertion.
   - اختبار فشل API أصبح يثبت اعتراض الطلبات عبر `page.route('**/api/**')` قبل الانتقال إلى `/products`، ثم يتحقق من ظهور حالة الخطأ.
   - صححنا اسم عنوان مركز الأوفلاين في الاختبار إلى النص الموجود فعليًا في `OfflineHub`: `جاهزية التطبيق بدون نت`.

2. **إصلاح فحوص التدقيق الثابتة**
   - `apps/web/scripts/loading-system-audit.mjs`: أصبح فحص زر حفظ البحث يقبل ترتيب خصائص JSX الفعلي، مع بقاء التحقق من `loading` و`loadingText`.
   - `apps/web/scripts/hydration-regression-audit.mjs`: تم تحديث نمط الفحص ليتوافق مع `className` المكتوب كقالب JSX، ومع مكوّن Next.js `Script` المستخدم فعليًا.
   - `apps/web/scripts/route-navigation-loading-audit.mjs`: تم ربط فحص إعادة توجيه الإدارة بالملف المسؤول فعليًا `components/admin/AdminLayoutClient.tsx`، وتحديث فحوص تغيّر المسار/المؤقتات وفق تطبيق `NavigationProgress` الحالي.

3. **أوامر npm التي كانت تشير إلى ملفات تدقيق غير موجودة**
   - أزلنا 36 مدخلًا من `apps/web/package.json` كانت تشير مباشرة إلى ملفات `scripts/*` غير موجودة في الحزمة.
   - لم نحذف تقارير المراحل أو ملفات المصدر؛ أزلنا فقط أوامر تشغيل معطوبة حتى لا توحي بأنها اختبارات قابلة للتشغيل.
   - أضفنا `npm run audit:script-references` مع `apps/web/scripts/package-script-reference-audit.mjs` للتحقق من وجود ملفات الأوامر وصحة مراجع `npm run` الداخلية.

## نتائج التحقق التي أُعيد تشغيلها

- Edge cache worker test: **1/1 ناجح**.
- Offline final audit: **8/8 ناجح**.
- Visited pages priority audit: **7/7 ناجح**.
- Offline cache truth audit: **30/30 ناجح**.
- Offline pinned shells audit: **8/8 ناجح**.
- Offline mutation policy audit: **21/21 ناجح**.
- Offline phase 8 integration static audit: **13/13 ناجح**.
- Offline idempotency scope audit: **13/13 ناجح**.
- Loading system audit: **53/53 ناجح**.
- Route navigation loading audit: **65/65 ناجح**.
- Hydration regression audit: **15/15 ناجح**.
- Package script reference audit: **90 أمرًا تم التحقق منها دون مراجع ملفات أو أوامر npm مفقودة**.
- `package.json`: JSON صالح.

## ما لم يتم إثباته بعد

- لم يتم تشغيل Playwright فعليًا داخل متصفح؛ الحزمة لا تحتوي `node_modules`، ولم يتم تثبيت الاعتماديات ضمن هذه الجولة.
- لم يتم تشغيل `npm run type-check` أو بناء Next.js إنتاجي؛ لذلك لا أدعي خلو المشروع من أخطاء TypeScript أو البناء.
- اختبار الأوفلاين المعدل يحتاج تشغيل Playwright بعد تثبيت الاعتماديات للتأكد من سلوك Service Worker في Chromium فعليًا.
- لم تُحذف الملفات الجذرية ذات الأسماء الغريبة؛ لا يمكن إثبات أنها غير مستخدمة من الاسم وحده، فتم الحفاظ عليها لتجنب فقدان بيانات.

## التوصية التالية

تشغيل تثبيت الاعتماديات وفق lockfile المعتمد، ثم `npm run type-check` و`npm run build` وPlaywright smoke/offline suites. بعد ذلك تُعالج الأخطاء الفعلية الناتجة عن التشغيل، لا مجرد نتائج فحوص النصوص.
