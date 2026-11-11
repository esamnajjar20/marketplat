# الحجم وCode Splitting

## ما هو مفعّل أصلًا
- Expo/Metro يقسّم المسارات عبر Expo Router تلقائيًا عند التنقل.
- `freezeOnBlur` يقلل عمل الشاشات غير المرئية.
- Proguard + shrink resources على Android (app.json plugins).

## توصيات
1. تجنّب استيراد شاشات ثقيلة من `_layout` بشكل ثابت.
2. الصور عبر `expo-image` (موجود).
3. راقب الحجم:
   ```bash
   npx expo export --platform android
   # أو
   npx react-native-bundle-visualizer
   ```
4. أقسام Home الثقيلة (`HomeMarketplaceSections`) تُبقى imports ديناميكية إن أمكن لاحقًا.

## لا تفعّل
- تقسيم يدوي مفرط يكسر Fast Refresh أثناء التطوير.
