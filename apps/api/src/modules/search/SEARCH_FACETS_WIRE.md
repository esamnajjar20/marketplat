# دمج Facets في Backend

## 1. الملفات

انسخ/ادمج:

| الملف | الوجهة |
|--------|--------|
| `search.facets.types.ts` | `apps/api/src/modules/search/` (أو ادمج في search.types.ts) |
| `search.facets.validation.ts` | نفس المجلد |
| `search.facets.repository.ts` | ادمج المنطق في `search.repository.ts` |
| `search.facets.service.ts` | ادمج في `search.service.ts` |

## 2. Controller

أضف في `search.controller.ts`:

```ts
import { searchFacetsQuerySchema } from './search.facets.validation';
import { getSearchFacets } from './search.facets.service';

// داخل searchController:
facets: async (req, res, next) => {
  try {
    const { query } = searchFacetsQuerySchema.parse({ query: req.query });
    const data = await getSearchFacets(query);
    res.status(200).json(successResponse('Search facets', data));
  } catch (error) {
    next(error);
  }
},
```

## 3. Routes

في `search.routes.ts`:

```ts
searchRouter.get('/facets', CACHE.SHORT, searchController.facets);
```

ضع المسار **قبل** أي `/:id` إن وُجد (حالياً لا يوجد).

## 4. ملاحظات SQL

- النسخة المرفقة تستخدم `prisma.ad.groupBy` كبداية.
- للبحث الموحّد (ads+products+stores+services) انقل التجميع إلى `$queryRaw` بنفس فروع UNION في `search.repository.ts`.
- لا تُضمّن بُعد الـ facet في WHERE عند حساب ذلك البُعد (disjunctive facets).

## 5. اختبار يدوي

```bash
curl 'http://localhost:4000/api/v1/search/facets?type=ads&city=غزة'
```

المتوقع: JSON فيه `cities`, `categories`, `conditions`, `priceRanges`, `total`.
