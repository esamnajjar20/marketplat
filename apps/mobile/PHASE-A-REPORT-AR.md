# المرحلة A — تقرير التنفيذ

## ما تغيّر
1. **توحيد مدخل الواجهة:** 90 ملفاً انتقلت من `@/components/MobileUI` إلى `@/components/ui`، مع دمج الاستيرادات المكررة (27 ملفاً). `MobileUI.tsx` بقي كـ shim مهمل (سكربتات التحقق القديمة تتحقق من وجوده) وقاعدة ESLint `no-restricted-imports` تمنع الاستيراد منه.
2. **نصوص مشتركة:** `src/lib/copy.ts`؛ 10 رسائل خطأ احتياطية + `ErrorState` تستخدمه. وحّدت ذيل الرسائل («أعد المحاولة.» ← «حاول مرة أخرى.») في 6 مواضع.
3. **`Field` بدل `TextInput` الخام:** 9 حقول في `my-store.tsx` و`product-editor.tsx`.
4. **Prettier:** `.prettierrc.json` و`.prettierignore` وسكربتات `format` و`format:check` + devDependency. **لم أشغّله** (غير متاح بدون شبكة) → شغّله عندك مرة وحدة.
5. **RTL:** `plugins/with-forced-rtl.js` (مسجّل في `app.json`) يضمن بقاء فرض RTL الأصلي في Android بعد `expo prebuild`. منطقه مُختبر على الملف الحالي (لا يغيّره) وعلى قالب جديد (يضيف المطلوب، ومتكرر بلا آثار).
6. **تقرير تتبّع:** `pnpm report:tokens` (غير حاجب).
7. **التوثيق:** حذف 69 نسخة مكررة طبق الأصل من جذر الموبايل (مطابقة SHA-256 لنسخ `docs/history`)، ونقل 7 ملفات فريدة إلى `docs/history/`، وتصحيح `DESIGN-SYSTEM-AR.md` (كان يوصي بـ `row-reverse`) وسطر الوضع الداكن في `README.md`.

## ما تحققت منه
- فحص صياغة (parse) لكل الملفات المعدّلة: 0 أخطاء.
- سكربتات التحقق الثابتة: نتائج كل فحص متطابقة قبل/بعد.

## ما لم أتحقق منه (يلزم عندك)
```bash
pnpm install
pnpm format          # مرة وحدة، ثم راجع الفرق
pnpm type-check && pnpm lint && pnpm test
```
- لم أشغّل `tsc` ولا ESLint ولا Vitest (لا `node_modules`).
- الشكل البصري لحقول `Field` في الشاشتين المحوَّلتين يحتاج نظرة على جهاز.

## مؤجّل عمداً (موثّق)
- ~30 `TextInput` خام متبقٍ (بحث/دردشة/فلاتر/تقارير) أشكالها مختلفة عن `Field`.
- 244 `Pressable` خام مقابل `AccessiblePressable` غير المستخدم (يحتاج قرار: اعتماده أو حذفه).
- ~160 رقم مباشر للمسافات/الزوايا → تتبّعها `pnpm report:tokens`.
- إقلاع RTL على iOS (JS فقط، يحتاج جهاز iOS للتحقق).
