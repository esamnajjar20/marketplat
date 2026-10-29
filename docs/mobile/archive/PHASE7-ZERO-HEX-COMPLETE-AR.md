# المرحلة 7 — إكمال الترحيل وإغلاق الألوان الخام

## النتيجة
- **0** لون hex خام داخل `app/` و `src/components/`
- سكربت الحوكمة صار **صارماً على كامل** `app/` و `src/components/`
- `node scripts/verify-design-tokens-no-raw-hex.mjs` → ✅

## ما شملته هذه المرحلة
1. استبدال كل ألوان hex المتبقية (~47) بـ tokens (danger / brand / warning / ink / border…)
2. تنظيف `profile.tsx` و`offline-queue` و`stories*` و`my-sales` و`search` وغيرها
3. غلاف `AppHeader` لشاشات البحث والقصص
4. `Icons.tsx` من المرحلة السابقة يبقى مرجع الرموز الموحّد

## المسارات الحرجة (مراحل 1–6) ما زالت قائمة
Design System، التفاصيل، القوائم، الدخول، الرسائل، الطلبات، المفضلة، الحساب، إلخ.

## ملاحظات صيانة
- أي شاشة جديدة: لا تكتب `#...` مباشرة — استخدم `@/theme/tokens`
- الفحص جزء من `npm test` عبر `verify-*.mjs`
