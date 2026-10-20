# المرحلة 1 — غلاف تطبيق (APK يبدو كتطبيق)

## الملفات

| المسار | إجراء |
|--------|--------|
| `frontend/styles/native-app.css` | **جديد** |
| `frontend/components/pwa/CapacitorBootstrap.tsx` | **استبدال** |
| `frontend/components/layout/PublicFooter.tsx` | **استبدال** |
| `frontend/components/layout/PublicHeader.tsx` | **استبدال** |
| `frontend/components/layout/BottomNav.tsx` | **استبدال** |
| `frontend/app/(public)/layout.tsx` | **استبدال** |
| `frontend/lib/runtime/navigation.ts` | دمج `applyNativeChrome` من الملف الملحق |

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
