# المرحلة 2 — تدفقات أكثر شبهاً بالتطبيق

## ما أُنجز

1. **الرئيسية**
   - إخفاء HomeAppPromo داخل الـ APK
   - إخفاء Nearby على Native (بدون GPS)
   - عنوان اكتشاف أصغر + إخفاء النص التسويقي الطويل

2. **تفاصيل الإعلان**
   - شريط مراسلة فوق BottomNav + safe-area

3. **زر رجوع Android**
   - يغلق Dialog/Sheet قبل router.back()

4. **Hook** useIsNativeApp

## الدمج

| ملف | إجراء |
|-----|--------|
| styles/native-app.css | استبدال (يشمل مرحلة 1+2) |
| hooks/useIsNativeApp.ts | جديد |
| components/home/HomePageContent.tsx | استبدال |
| components/home/HomeDiscoverHero.tsx | استبدال |
| lib/runtime/navigation.ts | استبدل registerNativeBackButton من الملف الملحق |

تأكد من: import '@/styles/native-app.css'
