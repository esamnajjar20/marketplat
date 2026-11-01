# تمريرة الأداء الخفيف — MarketPlat Mobile

## الهدف
تحسين الصور والقوائم والتحقق من النماذج بمكتبات خفيفة فقط (`expo-image` + `zod`).

## ما تم تنفيذه

### 1) مكتبات خفيفة
- `expo-image` (~58) في `package.json`
- `zod` (^3.24.2) في `package.json`

### 2) صور موحّدة
- `src/components/AppImage.tsx` — غلاف خفيف فوق expo-image
- تطبيق AppImage في:
  - `src/components/MarketCards.tsx`
  - `app/index.tsx` (خدمات)
  - `src/features/discovery/HomeCommunitySections.tsx`
  - `src/features/discovery/HomeMarketplaceSections.tsx`
  - `src/features/discovery/DiscoveryFeedScreen.tsx`
  - `app/service-images.tsx`
  - `app/ads/[id].tsx`
  - `app/seller-orders.tsx`
  - وملفات أخرى كانت تستخدم Image للعرض

### 3) أداء القوائم (بدون FlashList)
- `src/lib/listPerformance.ts` — `marketListPerf` و `denseListPerf`
- تحويل إلى FlatList:
  - `app/messages.tsx`
  - `app/favorites.tsx`
  - `app/my-ads.tsx`
  - `app/notifications.tsx`

### 4) تحقق النماذج بـ zod
- `src/lib/validation.ts` — مخططات login/register/adDraft + `validate()`
- ربط:
  - `app/login.tsx`
  - `app/register.tsx`

## التثبيت محليًا

```bash
cd apps/mobile
npx expo install expo-image
npm install zod
# أو من جذر المونوريبو حسب أسلوب المشروع
npm run type-check
```

## ملاحظات
- لم نُضف FlashList / Reanimated / Maps.
- الشاشات المختلطة (مثل الرئيسية) بقيت ScrollView وهذا مناسب.
- بعض شاشات PageShell المكدّسة (activity/debts/…) ما زالت `.map` ويمكن تحويلها لاحقًا بنفس النمط.
