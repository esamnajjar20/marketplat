# Phase 2 — ملخص التسليم

## الهدف
إحصاءات الفلاتر (Facets) + تخزين Preferences على Native + اختبارات E2E.

## الملفات الجديدة

### Backend
| الملف | الوظيفة |
|--------|---------|
| `backend/search/search.facets.types.ts` | شكل الاستجابة |
| `backend/search/search.facets.validation.ts` | Zod للـ query |
| `backend/search/search.facets.repository.ts` | تجميع (بداية على Ads عبر groupBy) |
| `backend/search/search.facets.service.ts` | Redis cache 30s |
| `backend/search/SEARCH_FACETS_WIRE.md` | خطوات الربط في routes/controller |

### Frontend
| الملف | الوظيفة |
|--------|---------|
| `api/search.facets.api.ts` | عميل GET /search/facets |
| `hooks/useSearchFacets.ts` | React Query |
| `lib/capacitor/filterPreferencesStorage.ts` | Preferences + localStorage لـ Zustand |
| `components/search/FacetCountBadge.tsx` | عرض (N) بجانب الخيار |
| `docs/PHASE2_FACETS_UI.md` | كيفية ربط العدد في الـ Sheet |
| `e2e/native-filters.spec.ts` | Playwright viewport 390 |

## ترتيب التنفيذ المقترح

1. **Backend facets** (validation → repository → service → controller → route)
2. تجربة `curl /api/v1/search/facets?type=ads`
3. دمج `searchApi.facets` + `useSearchFacets`
4. تحديث `NativeFilterSheet` حسب PHASE2_FACETS_UI.md
5. تبديل storage في `filter.store` إلى `filterPreferencesStorage`
6. تشغيل E2E: `npx playwright test e2e/tests/native-filters.spec.ts`

## تحذير مهم
`search.facets.repository.ts` يعتمد على `prisma.ad` كمسار أولي.
قبل الإنتاج: وسّع التجميع ليشمل products/services/stores بنفس فروع UNION في `search.repository.ts`، أو اقبل أن الـ facets تعكس الإعلانات فقط في المرحلة الأولى.

## Phase 3 (مقترح لاحقاً)
- Saved filter presets ↔ module `saved-searches`
- Dynamic category attributes
- Radius slider على الخريطة
- Analytics events (`filter_apply`, `quick_filter_tap`)
