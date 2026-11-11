# المرحلة 3 — سحب للتحديث + نشر كتطبيق

## الواقع في المشروع (مهم)

- **AdForm** فيه wizard من 3 خطوات مسبقاً (create mode).
- **ImageUpload** يستدعي `takeOrPickNativePhoto` على Capacitor مسبقاً.
- **PullToRefresh** موجود؛ كان مستخدماً في ProductsGrid فقط.

هذه المرحلة **تربط** السحب للتحديث وتُصقُل واجهة النشر داخل الـ APK.

## الملفات

| ملف | إجراء |
|-----|--------|
| `components/home/HomePageContent.tsx` | استبدال (Pull + مرحلة 2) |
| `components/search/SearchPullToRefresh.tsx` | جديد |
| `app/(public)/search/page.tsx` | لفّ النتائج بـ SearchPullToRefresh (انظر page.patch-notes) |
| `styles/native-app.css` | استبدال (مراحل 1–3) |
| `components/shared/forms/CreateFormLayout.tsx` | class للجذر |
| `app/(protected)/ads/create/page.tsx` | shell class |

## تحقق

- [ ] الرئيسية: اسحب للأسفل → تتحدث البيانات
- [ ] البحث: اسحب للأسفل → تتحدث النتائج
- [ ] نشر إعلان: 3 خطوات ظاهرة؛ زر كاميرا native على APK
- [ ] لا معاينة سطح مكتب جانبية داخل APK
