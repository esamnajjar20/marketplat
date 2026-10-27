# المرحلة 4 — حوكمة + صقل

## ما تم تنفيذه

### 1. `AdCard` في الصفحة الرئيسية
قائمة الإعلانات في `index.tsx` تستخدم المكوّن المشترك مع المفضلة ومعالجة فشل الصورة.

### 2. شاشة المفضلة
إعادة هيكلة بصرية:
- `AppHeader` + `AdCard`
- `LoadingState` / `EmptyState` / `ErrorState`
- نفس منطق المزامنة والـ outbox دون تغيير

### 3. حوكمة Design Tokens
سكربت: `scripts/verify-design-tokens-no-raw-hex.mjs`
- **صارم** على الملفات المرحَّلة (phases 1–4)
- **تحذير فقط** لباقي الشاشات القديمة (~107 hex متبقية للترحيل التدريجي)
- يُشغَّل تلقائيًا ضمن `npm test` لأنه ضمن `verify-*.mjs`

### 4. تنظيف جزئي
- `_layout.tsx`: `colors.white`
- `ad-editor.tsx`: استبدال danger/white hex بـ tokens
- `MobileUI`: badgeAccent من tokens

## الملفات
| الملف | التغيير |
|-------|---------|
| `app/index.tsx` | AdCard |
| `app/favorites.tsx` | إعادة هيكلة |
| `app/_layout.tsx` | token |
| `app/ad-editor.tsx` | tokens في الأنماط |
| `src/components/MarketCards.tsx` | onImageError |
| `src/components/MobileUI.tsx` | badgeAccent |
| `scripts/verify-design-tokens-no-raw-hex.mjs` | جديد |

## المرحلة التالية (اختياري)
- ترحيل الرسائل / الدخول / my-ads من hex المتبقي
- تفكيك `ad-editor` إلى أقسام بصرية (أساسيات / صور / مراجعة) دون لمس منطق المسودة
