# المرحلة 1 — غلاف تطبيق (APK يبدو كتطبيق)

## الملفات

| المسار | إجراء |
|--------|--------|
| `apps/web/styles/native-app.css` | **جديد** |
| `apps/web/components/pwa/CapacitorBootstrap.tsx` | **استبدال** |
| `apps/web/components/layout/PublicFooter.tsx` | **استبدال** |
| `apps/web/components/layout/PublicHeader.tsx` | **استبدال** |
| `apps/web/components/layout/BottomNav.tsx` | **استبدال** |
| `apps/web/app/(public)/layout.tsx` | **استبدال** |
| `apps/web/lib/runtime/navigation.ts` | دمج `applyNativeChrome` من الملف الملحق |

## تفعيل CSS

في `app/layout.tsx` أو أعلى `globals.css`:

```ts
import '@/styles/native-app.css';
```

```css
@import '../styles/native-app.css';
```

## التحقق

- لا فوتر موقع داخل الـ APK
- BottomNav ظاهر دائماً
- overscroll أقل «متصفحاً»
- Status bar بلون العلامة

## غير مشمول (مرحلة 2+)

رئيسية مخصصة، تفاصيل بإجراءات سفلية، wizard نشر، pull-to-refresh
