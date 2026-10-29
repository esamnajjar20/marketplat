# نظام التصميم — MarketPlat Mobile

## المبدأ
كل لون وحجم خط ومسافة وظل يأتي من `src/theme/tokens.ts`.  
الشاشات تستخدم مكوّنات `src/components/MobileUI.tsx` ولا تعرّف ألوان hex مباشرة.

## Tokens

| المجموعة | الملف | أمثلة |
|----------|--------|--------|
| ألوان | `colors` | `ink`, `brand`, `canvas`, `danger`, `successSoft` |
| مسافات | `spacing` | `xs` 4 → `xxxl` 40 |
| زوايا | `radius` | `sm` 10 → `pill` |
| خطوط | `typography` | `display`, `title`, `body`, `caption`, `button` |
| ظلال | `elevation` | `sm`, `md` |
| أحجام | `sizes` | `buttonHeight`, `headerHeight`, `touchTarget` |

الاستيراد المفضّل:
```ts
import { colors, spacing, typography } from '@/theme/tokens';
// أو
import { colors, spacing } from '@/theme';
```

## المكوّنات المشتركة (`MobileUI`)

| المكوّن | الاستخدام |
|---------|-----------|
| `PageShell` | غلاف شاشة مع رأس ورجوع وـ SafeArea |
| `AppHeader` | رأس مستقل (عنوان + رجوع + actions) |
| `SectionHeader` | عنوان قسم + اختياري «عرض الكل» |
| `SectionCard` | بطاقة محتوى (قابلة للضغط) |
| `ListRow` | صف قائمة موحّد (عنوان + وصف + سهم) |
| `Field` | حقل إدخال مع تسمية وخطأ اختياري |
| `PrimaryButton` | primary / secondary / danger / ghost |
| `SecondaryButton` | اختصار للثانوي |
| `Notice` | تنبيه error / success / info / warning / muted |
| `Badge` | شارة صغيرة |
| `Chip` | فلتر/اختيار |
| `LoadingState` | حالة تحميل |
| `EmptyState` | لا توجد بيانات + إجراء اختياري |
| `ErrorState` | خطأ + إعادة محاولة |

## قواعد سريعة
1. **لا** تضع `#176B5B` أو أي hex في ملفات `app/` — استخدم `colors.*`.
2. عناوين الأقسام عبر `SectionHeader` وليس `Text` بحجم يدوي.
3. روابط القوائم عبر `ListRow` وليس بطاقة مكررة يدوياً.
4. حالات فارغة/خطأ/تحميل عبر المكوّنات المخصّصة.
5. الـ Bottom Nav يُخفى تلقائياً في مسارات التفاصيل والمحررات (انظر `isBottomNavigationHidden`).
6. RTL: النصوص `textAlign: 'right'` والصفوف `flexDirection: 'row-reverse'`.

## الترحيل التدريجي
الشاشات القديمة التي ما زالت تستخدم `StyleSheet` محلي تُرحَّل عند لمسها.  
الأولوية: الرئيسية → التفاصيل → القوائم → المحررات.


## حوكمة (المرحلة 4)
شغّل من حزمة الموبايل:

```bash
node scripts/verify-design-tokens-no-raw-hex.mjs
```

أو ضمن `npm test` (كل `verify-*.mjs`).
يفشل البناء المنطقي إذا وُجد hex خام في الملفات المرحَّلة.
