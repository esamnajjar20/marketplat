# تنظيم الشاشات (اقتراح تطبيقي)

Expo Router يعتمد على `app/`. لا ننقل الملفات عشوائيًا دون تحديث الروابط.

## مجموعات منطقية (مجموعات مجلدات اختيارية عبر groups)

```
app/
  (tabs)/
    index.tsx          # الرئيسية
    explore.tsx
    add.tsx
    messages.tsx
    account.tsx
  (auth)/
    login.tsx
    register.tsx
    forgot-password.tsx
  (ads)/
    ads/[id].tsx
    ad-editor.tsx
    my-ads.tsx
    favorites.tsx
  (chat)/
    messages/[id].tsx
  ...
```

### خطوات آمنة
1. أنشئ المجموعة: `app/(tabs)/_layout.tsx` إن لزم.
2. انقل الشاشة مع `git mv`.
3. حدّث `routes.ts` و`BottomNavigation` إن تغيّر المسار الظاهر.
4. مجموعات `(name)` لا تظهر في URL — المسار يبقى `/messages`.

### ما لا يُنقل دفعة واحدة
- ~100 شاشة دفعة واحدة → مخاطر كسر الروابط العميقة.
- نفّذ مجموعة `(tabs)` أولًا، ثم `(auth)`، ثم `(ads)`.
