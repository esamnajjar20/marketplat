# المرحلة 1 — تطبيق التحسينات

## ما تم إنجازه

1. **تقسيم `MobileUI.tsx`** (~911 سطر → مجلد `src/components/ui/`)
2. **`React.memo` على `CatalogCard` و `AdCard`**
3. **استخراج `useHomeScreenState`** من شاشة الرئيسية

## هيكل الملفات الجديدة

```
apps/mobile/
├── src/
│   ├── components/
│   │   ├── MobileUI.tsx              ← طبقة توافق (re-export فقط)
│   │   ├── MarketCards.tsx           ← مع React.memo
│   │   └── ui/
│   │       ├── index.ts
│   │       ├── styles.ts
│   │       ├── AppHeader.tsx
│   │       ├── PageShell.tsx
│   │       ├── Button.tsx
│   │       ├── Field.tsx
│   │       ├── Section.tsx
│   │       ├── Feedback.tsx
│   │       ├── SearchBar.tsx
│   │       └── DetailScaffold.tsx
│   └── features/discovery/
│       └── useHomeScreenState.ts
```

## خطوات الدمج

### 1) نسخ الملفات

انسخ محتويات `mobile_phase1/src/` فوق المسارات المقابلة داخل `apps/mobile/src/`.

```bash
# من جذر المستودع
cp -R path/to/mobile_phase1/src/components/ui apps/mobile/src/components/
cp path/to/mobile_phase1/src/components/MobileUI.tsx apps/mobile/src/components/MobileUI.tsx
cp path/to/mobile_phase1/src/components/MarketCards.tsx apps/mobile/src/components/MarketCards.tsx
cp path/to/mobile_phase1/src/features/discovery/useHomeScreenState.ts apps/mobile/src/features/discovery/
```

### 2) التوافق العكسي

كل الملفات التي تستورد من `@/components/MobileUI` **ستعمل كما هي** لأن `MobileUI.tsx` أصبح re-export.

الملفات الجديدة يُفضَّل أن تستورد من:

```ts
import { PageShell, PrimaryButton, OfflineBanner } from '@/components/ui';
```

### 3) ربط `useHomeScreenState` في `app/index.tsx`

استبدل كتلة الـ state في أعلى الشاشة بما يلي:

```tsx
import { useHomeScreenState } from '@/features/discovery/useHomeScreenState';

export default function HomeScreen() {
  const { user, logout, isBusy, isRestoring } = useAuth();
  const {
    query, setQuery, submittedSearch, submitSearch, clearSearch,
    showFilters, setShowFilters,
    cityInput, setCityInput, minPriceInput, setMinPriceInput, maxPriceInput, setMaxPriceInput,
    filters, filterError, applyFilters, resetFilters,
    sortBy, sortOrder, setSort,
    favoriteIds, toggleFavorite,
  } = useHomeScreenState();

  const {
    ads, loading, refreshing, errorMessage, /* ... */
    loadAds, loadMoreAds, markImageFailed,
  } = useHomeAds({
    search: submittedSearch,
    filters,
    sort: { sortBy, sortOrder },
  });
  // ...
}
```

ثم استبدل الاستدعاءات:
- `setSubmittedSearch(query.trim())` → `submitSearch()`
- `setQuery(''); setSubmittedSearch('')` → `clearSearch()`
- منطق `applyFilters` القديم → `applyFilters()`
- `toggleFavorite(id)` يبقى كما هو (من الـ hook)

### 4) التحقق

```bash
cd apps/mobile
npx tsc --noEmit
# ثم تشغيل التطبيق والتأكد من:
# - الرئيسية تحمل
# - البحث والفلاتر
# - تبديل المفضلة
# - الشاشات التي تستخدم PageShell / PrimaryButton
```

## ملاحظات

- لم نغيّر سلوكًا وظيفيًا — فقط تنظيم وأداء قائمة.
- `React.memo` يعتمد على مقارنة props؛ تأكد أن `onPress` / `onToggleFavorite` مستقرة عبر `useCallback` (وهذا موجود في الـ hook).
- المرحلة 2 القادمة: توحيد نواة الـ Outbox.
