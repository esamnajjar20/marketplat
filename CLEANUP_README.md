# تنظيف ما بعد المراجعة (2026-09-09)

## 1. حذف 4 مكوّنات ميتة + التيست تبعها
تم التأكد فعلياً (بحث عن import حي، مش بس ذكر بالتعليقات) إنه ما فيه أي استخدام حالي لهذه الملفات — محتواها انتقل بالكامل لصفحة /profile/[id] الموحّدة سابقاً. احذفها يدوياً من نسختك:

- frontend/components/sellers/SellerProfileHeader.tsx
- frontend/components/sellers/SellerProfileAds.tsx
- frontend/components/services/ServiceProviderHeader.tsx
- frontend/components/services/ServiceProviderListings.tsx
- frontend/__tests__/components/SellerProfileHeader.test.tsx
- frontend/__tests__/components/SellerProfileAds.test.tsx
- frontend/__tests__/components/ServiceProviderHeader.test.tsx
- frontend/__tests__/components/ServiceProviderListings.test.tsx

بعد الحذف، شغّل `npm run type-check` و`npm run test` بالـ frontend للتأكيد (ما قدرت أشغّلهم هون لعدم توفر node_modules/شبكة بالبيئة).

## 2. تنظيف جذر الريبو
نقلت 15 ملف markdown/txt متراكم (تقارير تغييرات قديمة، مانيفستات، خطط إعادة تنظيم) من جذر المشروع إلى `docs/history/` بدل حذفها — محتواها تاريخي وقد يفيد للرجوع إليه، بس ما مكانه إنه يكون بجذر الريبو. الملفات منقولة كما هي بدون تعديل محتوى:

CHANGED_FILES_MANIFEST.txt, CHANGED_FILES_README.md, CHANGES-الفئة-الثالثة.md,
CHANGES-SUMMARY-auth-design.md, CHANGES-SUMMARY-auth.md, CHANGES-SUMMARY.md,
CHANGES-fraud-detection.md, CHANGES.md, CHANGES_SUMMARY.md, DELETE_THESE_FILES.txt,
FIX-NOTES.md, FIXES-COMPLETE-README.txt, MANIFEST.md, PR4A-REPORT.md, REORGANIZATION_PLAN.md

README.md بقي بمكانه بالجذر (طبيعي).

## خطوات التطبيق على نسختك
1. احذف الـ 8 ملفات المذكورة أعلاه.
2. أنشئ مجلد `docs/history/` وانقل الـ 15 ملف إليه (أو استخدم `docs/history/` المرفق هون كمرجع — نفس المحتوى).
3. `git add -A && git commit -m "chore: remove dead profile components, archive stale change-logs to docs/history"`.

## ما لم يتغيّر (بقرارك، مو نسيان)
- فحص الصور الصفرية بـ ads.controller.ts لسه معطّل عمداً (TRACK-IMG-HOSTING، بانتظار Cloudinary).
- Playwright E2E لسه يغطي auth/ad-lifecycle/favorites/admin بس.
- helmet() بإعدادات CSP الافتراضية، وoptionalQueryNumber مكرر بـ19 ملف validation — تحسينات كود صغيرة، غير حرجة.
- ما فيه `.github/workflows` (CI تلقائي) بالريبو — إذا عندك CI بمكان تاني (Railway مثلاً) تجاهل هالملاحظة.
