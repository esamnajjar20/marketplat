# المرحلة 6 — الجوانب المتبقية

## تغطية هذه المرحلة

| الجانب | الحل |
|--------|------|
| Status bar مع الوضع الداكن | `applyNativeChrome` + مراقب `class=dark` |
| شاشات إنشاء/تعديل ملء الشاشة | `isImmersiveTask` في `(protected)/layout` |
| مؤشر عدم اتصال واضح على Native | `NativeOfflineStrip` |
| sticky CTA للمنتجات/الخدمات | نفس CSS `.sticky-contact-bar` (كانت موجودة في المكوّنات) |
| مشاركة أصلية | موجودة مسبقاً عبر `nativeShare` في ShareAdButton |

## تركيب NativeOfflineStrip

في مزوّد التطبيق (مثلاً `AppProviders` أو بجانب `CapacitorBootstrap`):

```tsx
import { NativeOfflineStrip } from '@/components/offline/NativeOfflineStrip';

// داخل الشجرة:
<NativeOfflineStrip />
<CapacitorBootstrap />
```

## دمج applyNativeChrome

انسخ منطق `lib/runtime/applyNativeChrome.ts` إلى `navigation.ts` **أو** أعد التصدير:

```ts
// navigation.ts
export { applyNativeChrome, syncNativeStatusBarTheme } from './applyNativeChrome';
```

وحدّث CapacitorBootstrap لاستيراد `syncNativeStatusBarTheme`.

## ما يبقى اختيارياً (غير حرج)

- Virtualization للقوائم الطويلة جداً
- Onboarding أول تشغيل
- Dynamic shortcuts حسب آخر بحث
- إخفاء ProtectedSidebar على tablet داخل APK

هذه تحسينات أداء/منتج وليست ضرورية لإحساس «تطبيق».
