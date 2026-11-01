# المرحلة 1 — تأسيس Design System وتوحيد الهيكل

## ما تم تنفيذه

### 1. توسيع Design Tokens (`src/theme/tokens.ts`)
- ألوان دلالية إضافية: `brandSoftActive`, `dangerSoft`, `success*`, `info*`, `warning*`, `borderStrong`, `white`.
- `typography`: display / title / subtitle / body / bodyStrong / caption / button / label / overline.
- `elevation`: sm و md للبطاقات.
- `sizes`: touchTarget، input/button/header/bottomNav heights، avatars، chip.

### 2. نقطة تصدير (`src/theme/index.ts`)
- إعادة تصدير كل الـ tokens من مكان واحد.

### 3. تقوية MobileUI (`src/components/MobileUI.tsx`)
مكوّنات جديدة مع الحفاظ على التوافق مع الاستيرادات القديمة:
- `AppHeader` — رأس موحّد.
- `SectionHeader` — عنوان قسم + action اختياري.
- `ListRow` — صف قائمة موحّد (استكشف / حسابي).
- `SectionCard` — يدعم `onPress` اختيارياً.
- `SecondaryButton` + متغير `ghost` في `PrimaryButton`.
- `Field` — دعم رسالة `error`.
- `Badge`, `Chip`.
- `LoadingState`, `EmptyState`, `ErrorState`.
- `PageShell` — خيار `scroll={false}` للقوائم الافتراضية.

### 4. تطبيق على شاشات الهيكل
- `app/account.tsx` — يستخدم `SectionHeader` + `ListRow` + `PrimaryButton` بدل styles مضمّنة.
- `app/explore.tsx` — نفس النمط الموحّد.
- `BottomNavigation.tsx` — يعتمد على `sizes` و `brandSoftActive` بدل قيم ثابتة.

### 5. توثيق
- `DESIGN-SYSTEM-AR.md` — قواعد الاستخدام والترحيل.

## الملفات المعدّلة / الجديدة
| الملف | الحالة |
|-------|--------|
| `src/theme/tokens.ts` | موسّع |
| `src/theme/index.ts` | جديد |
| `src/components/MobileUI.tsx` | موسّع |
| `src/components/BottomNavigation.tsx` | محدّث |
| `app/account.tsx` | موحّد |
| `app/explore.tsx` | موحّد |
| `DESIGN-SYSTEM-AR.md` | جديد |
| `PHASE1-DESIGN-SYSTEM-AR.md` | هذا الملف |

## التوافق العكسي
- كل الاستيرادات السابقة (`PageShell`, `Field`, `PrimaryButton`, `Notice`, `SectionCard`) ما زالت تعمل.
- الشاشات غير الملموسة لم تُكسر.

## الخطوة التالية (المرحلة 2)
1. ترحيل الصفحة الرئيسية (`index.tsx`) لاستخدام `SectionHeader` والبطاقات الموحّدة.
2. توحيد شاشات التفاصيل (إعلان / منتج / خدمة) بهيكل واحد + CTA سفلي.
3. استبدال Empty/Error المحلي بـ `EmptyState` / `ErrorState` في القوائم.
