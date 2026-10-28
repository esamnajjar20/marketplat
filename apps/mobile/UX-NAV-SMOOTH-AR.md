# تنقل سلس + UI/UX

## التنقل
| العنصر | التحسين |
|--------|---------|
| `Stack` الافتراضي | `slide_from_right` + إيماءة رجوع كاملة |
| تبويبات رئيسية | `fade` خفيف (بدون تكديس ثقيل) |
| دخول / تسجيل / محررات | `slide_from_bottom` كأوراق عمل |
| `freezeOnBlur` | يقلل عمل الشاشات غير الظاهرة |
| `goTab` / `openScreen` | حماية من النقر المزدوج ~380ms |
| شريط سفلي | تجاهل الضغط على التبويب النشط |

## UI عام
- شريط «غير متصل» مرة واحدة على مستوى التطبيق
- زر رجوع بأهداف لمس أوضح
- StatusBar dark على خلفية فاتحة

## الملفات
- `src/lib/navigation.ts`
- `app/_layout.tsx`
- `src/components/BottomNavigation.tsx`
- `src/components/MobileUI.tsx` (AppHeader)
