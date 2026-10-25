# MarketPlat — Native Filters Package

خطة وتنفيذ فلاتر Native للمنصة (Capacitor + Next.js).

## المراحل

| المرحلة | الحالة | الدليل |
|---------|--------|--------|
| **Phase 1** | جاهز للنسخ | Sheet + Store + Quick filters + Desktop sync |
| **Phase 2** | جاهز للنسخ | Facets API + Preferences + E2E |
| **Phase 3** | جاهز للنسخ | Saved presets + Analytics + Attributes pilot |

## البدء السريع

1. اقرأ `docs/PHASE1_INTEGRATION_AR.md` وانسخ ملفات الواجهة.
2. اربط صفحة البحث عبر `app/search/page.patch.tsx`.
3. Backend facets: `apps/api/search/SEARCH_FACETS_WIRE.md`
4. Phase 2 UI: `docs/PHASE2_FACETS_UI.md`
5. Phase 3: `docs/PHASE3_INSTRUMENTATION.md`

## هيكل الملفات (30 ملفاً)

```
types/           filter.types.ts, categoryAttributes.ts
lib/             filterUrl, filterAnalytics, filterSavedSearch
lib/capacitor/   nativeHaptics, filterPreferencesStorage
store/           filter.store.ts
components/search/
  NativeFilterSheet, QuickFiltersBar, SearchFilters,
  SearchActiveFilters, SaveFilterPresetButton,
  CategoryAttributesFilter, FacetCountBadge
api/             search.facets.api.ts
hooks/           useSearchFacets.ts
apps/api/search/  facets types/validation/repo/service + wire doc
e2e/             native-filters.spec.ts
__tests__/       filterUrl.test.ts
docs/            PHASE1–3 guides
app/search/      page.patch.tsx
```

## اعتماديات اختيارية

```bash
npm i @capacitor/haptics   # إن لم يكن مثبتاً
# @capacitor/preferences و @capacitor/geolocation موجودان مسبقاً
npx cap sync
```
