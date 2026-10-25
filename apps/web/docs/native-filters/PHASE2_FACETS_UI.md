# Phase 2 — ربط Facets بواجهة الـ Sheet

## في `NativeFilterSheet.tsx`

### 1) Imports

```tsx
import { useSearchFacets } from '@/hooks/queries/useSearchFacets';
import { FacetCountBadge } from '@/components/search/FacetCountBadge';
import { CONDITION_LABELS } from '@/types/filter.types';
```

### 2) استدعاء الـ hook (داخل المكوّن)

```tsx
const facetsQuery = useSearchFacets(
  {
    q: draft.q,
    type: draft.type,
    city: draft.city,
    categoryId: draft.categoryId,
    minPrice: draft.minPrice,
    maxPrice: draft.maxPrice,
    condition: draft.condition,
    lat: draft.lat,
    lng: draft.lng,
    radius: draft.radius,
  },
  { enabled: isOpen },
);

const facets = facetsQuery.data;
```

### 3) عرض العدد بجانب المدن

بدل `CITIES.map` الثابت، إن وُجدت facets.cities استخدمها:

```tsx
{(facets?.cities?.length
  ? facets.cities
  : CITIES.map((c) => ({ value: c, label: c, count: -1 }))
).map((bucket) => (
  <SelectItem key={bucket.value} value={bucket.value}>
    {bucket.label}
    <FacetCountBadge count={bucket.count >= 0 ? bucket.count : undefined} />
  </SelectItem>
))}
```

ملاحظة: بعض أنظمة Select لا تحب عناصر معقّدة داخل `SelectItem` — إن ظهرت مشاكل، ضع العدد في `text` فقط:

```tsx
{`${bucket.label}${bucket.count >= 0 ? ` (${bucket.count})` : ''}`}
```

### 4) Presets السعر مع العدد

```tsx
{PRICE_PRESETS.map((p) => {
  const facet = facets?.priceRanges?.find((r) => {
    if (!p.min && !p.max) return r.value === 'any';
    if (p.min && !p.max) return r.value === '500+';
    return r.value === `${p.min}-${p.max}`;
  });
  // ...
  {p.label}
  <FacetCountBadge count={facet?.count} />
})}
```

### 5) Footer يعرض الإجمالي التقريبي

```tsx
عرض النتائج
{facets?.total != null ? ` — ${facets.total}` : count > 0 ? ` (${count})` : ''}
```

### 6) store persistence

في `filter.store.ts` استبدل storage:

```ts
import { filterPreferencesStorage } from '@/lib/capacitor/filterPreferencesStorage';

// ...
storage: createJSONStorage(() => filterPreferencesStorage),
```

`@capacitor/preferences` مثبت مسبقاً في package.json — لا حاجة لحزمة جديدة.
