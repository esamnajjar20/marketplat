# نظام التصميم — MarketPlat Mobile

> المرجع الحي. أرشيف المراحل السابقة في `docs/history/`. قرارات RTL في `docs/RTL-ARCHITECTURE-AR.md`.

## المبدأ
كل لون وحجم خط ومسافة وزاوية وظل يأتي من `src/theme/tokens.ts`.
الشاشات تبني واجهاتها من `@/components/ui` ولا تعرّف ألوان hex.

```ts
import { colors, spacing, radius, typography } from '@/theme/tokens'; // للثوابت
import { useAppTheme } from '@/theme/ThemeProvider';                    // للألوان المتغيّرة (فاتح/داكن)
import { PageShell, Field, PrimaryButton } from '@/components/ui';      // المكوّنات
import { COPY } from '@/lib/copy';                                      // النصوص المشتركة
```

> `@/components/MobileUI` **مهمل** (compat shim فقط) وقاعدة ESLint تمنع الاستيراد منه.

## Tokens
| المجموعة | أمثلة |
|----------|--------|
| `colors` / `darkColors` | `ink`, `brand`, `canvas`, `danger`, `successSoft` |
| `spacing` | `xs` 4 → `xxxl` 40 |
| `radius` | `sm` 10 → `pill` |
| `typography` / `fontSizes` / `fontWeights` | `title`, `body`, `caption`, `button` |
| `elevation` | `sm`, `md` |
| `sizes` | `buttonHeight`, `headerHeight`, `touchTarget` |

## المكوّنات (`@/components/ui`)
`PageShell`, `AppHeader`, `SectionHeader`, `SectionCard`, `ListRow`, `Field`, `PrimaryButton`,
`SecondaryButton`, `Notice`, `Badge`, `Chip`, `SearchBar`, `DetailScaffold`, `ProductCard`،
وحالات القوائم: `LoadingState`, `Spinner`, `Skeleton*`, `EmptyState`, `ErrorState`,
`ListEmpty`, `ListStaleError`, `PaginatedFooter`, `OfflineBanner`.

## القواعد
1. **لا hex** خام في `app/` و`src/` (يفرضها ESLint و`lint-mobile.mjs`).
2. **حقول الإدخال عبر `Field`** عند وجود تسمية ظاهرة. `TextInput` الخام فقط لحقول البحث/الدردشة/الفلاتر الخاصة.
3. **لا `row-reverse`**: RTL أصلي (`forceRTL`) فالصفوف العادية تنعكس تلقائيًا. (النسخة السابقة من هذا الملف قالت العكس وكانت خاطئة.)
4. **نصوص الأخطاء/إعادة المحاولة من `COPY`**: زر = «إعادة المحاولة» (`COPY.retryAction`)، رسالة = «حاول مرة أخرى.» (`COPY.tryAgain`).
5. المسافات والزوايا من `spacing` و`radius` وليس أرقامًا مباشرة (تتبّع التقدّم: `pnpm report:tokens`).
6. حالات التحميل/الفراغ/الخطأ عبر مكوّنات `ui` ولا تبنِ حالات محلية.
7. الشريط السفلي يُخفى تلقائيًا في التفاصيل والمحررات (`navigation-policy.ts`).

## التنسيق
Prettier هو المرجع (`.prettierrc.json`):

```bash
pnpm install        # لتثبيت prettier
pnpm format         # يعيد تنسيق app/ و src/
pnpm format:check   # للتحقق
```
