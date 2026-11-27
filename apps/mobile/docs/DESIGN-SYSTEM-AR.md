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
| `colors` / `darkColors` | `ink`, `brand`, `canvas`, `danger`, `dangerText`, `warningText`, `successSoft` |
| `spacing` | `xs` 4 → `xxxl` 40 |
| `radius` | `sm` 10 → `pill` |
| `typography` / `fontSizes` / `fontWeights` | `title`, `body`, `caption`, `button` |
| `elevation` | `sm`, `md` |
| `sizes` | `buttonHeight`, `headerHeight`, `touchTarget` |
| `layout` | `pageHorizontal`, `pageVertical`, `pageSectionGap`, `pageHeaderMinHeight` |

## المكوّنات (`@/components/ui`)
`PageShell`, `AppHeader`, `SectionHeader`, `SectionCard`, `ListRow`, `Field`, `PrimaryButton`,
`SecondaryButton`, `Notice`, `Badge`, `Chip`, `FilterChip`, `SearchBar`, `DetailScaffold`, `ProductCard`،
وحالات القوائم: `LoadingState`, `Spinner`, `Skeleton*`, `EmptyState`, `ErrorState`,
`ListEmpty`, `ListStaleError`, `PaginatedFooter`, `OfflineBanner`.

## القواعد
1. **لا hex** خام في `app/` و`src/` (يفرضها ESLint و`lint-mobile.mts`).
2. **حقول الإدخال عبر `Field`** عند وجود تسمية ظاهرة. يدعم `Field` تخصيص `inputStyle` و`labelStyle` و`containerStyle`، ورسالة `hint` وعدّاد `showCharacterCount`. `TextInput` الخام فقط لحقول البحث/الدردشة/الفلاتر الخاصة أو الإدخال المتخصص داخل صف بيانات مضغوط.
3. **لا `row-reverse`**: RTL أصلي (`forceRTL`) فالصفوف العادية تنعكس تلقائيًا. (النسخة السابقة من هذا الملف قالت العكس وكانت خاطئة.)
4. **نصوص الأخطاء/إعادة المحاولة من `COPY`**: زر = «إعادة المحاولة» (`COPY.retryAction`)، رسالة = «حاول مرة أخرى.» (`COPY.tryAgain`).
5. المسافات والزوايا من `spacing` و`radius` وليس أرقامًا مباشرة (تتبّع التقدّم: `pnpm report:tokens`). الأدوار المشتركة: control=10dp، card=14dp، modal=16dp، shell=20dp، hero=24dp.
6. حالات التحميل/الفراغ/الخطأ عبر مكوّنات `ui` ولا تبنِ حالات محلية.
7. `FilterChip` هو مكوّن الاختيار المرئي المشترك على Native؛ أبقِ الارتفاع والحدود والألوان مرتبطة بـ `spacing` و`radius` و`colors`، ولا تنشئ شرائح محلية متكررة.
8. الشريط السفلي يُخفى تلقائيًا في التفاصيل والمحررات (`navigation-policy.ts`).

## تخطيط الصفحات

- `PageShell` و`DetailScaffold` يستخدمان `AppHeader` نفسه؛ الاختلاف بينهما في منطقة المحتوى والتمرير وليس في بنية رأس الشاشة.
- قياسات الصفحة المشتركة معرفة في `layout` داخل `src/theme/tokens.ts`، وتُستهلك عبر `src/components/ui/styles.ts`.
- استخدم `SectionHeader` لعناوين أقسام المحتوى، ولا تستبدله بعنوان شاشة ثانٍ.
- يجوز أن يختلف حجم النص أو كثافة الترتيب عن الويب لتناسب الهاتف، لكن يجب الحفاظ على ترتيب الأولوية البصرية وأدوار الألوان والمسافات والزوايا.

## التنسيق
Prettier هو المرجع (`.prettierrc.json`):

```bash
pnpm install        # لتثبيت prettier
pnpm format         # يعيد تنسيق app/ و src/
pnpm format:check   # للتحقق
```


## سياسة الخطوط والتكافؤ مع Web

- Native يستخدم خط النظام على Android/iOS عمدًا، ولا يضمّن ملف Cairo إضافيًا ضمن التطبيق. الويب يستخدم Cairo Variable وIBM Plex Mono. هذا اختلاف منصّي موثق؛ المطلوب تكافؤ التسلسل البصري وارتفاعات السطر، لا فرض نفس ملف الخط على المنصتين.
- ألوان الأدوار الأساسية في Light/Dark يجب أن تطابق خريطة Web في `frontend/docs/DESIGN-SYSTEM-AR.md`.
- فحص التكافؤ: `pnpm verify:design-system-parity` أو `pnpm verify:static` من حزمة الموبايل.
