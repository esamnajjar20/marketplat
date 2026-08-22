import { z } from 'zod';
import { AdCondition } from '@prisma/client';

// PLATFORM-WIDE-01: which entity kind this saved search matches against.
// Defaults to 'ads' so every saved search created before this field
// existed (filters JSON with no `type` key at all) still deserializes
// and matches exactly as before — see matchesFilters in
// saved-searches.service.ts, which branches on this same default.
export const savedSearchTypeSchema = z.enum(['ads', 'products', 'services']).default('ads');

// Filters mirror ads.validation.ts's getAdsSchema query shape — kept as a
// deliberately separate schema (not an import/reuse of getAdsSchema)
// because this one is validating a *stored* filter payload, not live
// query-string params: no page/limit/sortBy/sortOrder here (a saved
// search is a matching criteria set, not a paginated request), and
// numeric fields arrive as real JSON numbers from the request body
// rather than strings that need coercion from a query string.
//
// PLATFORM-WIDE-01: `city` and `condition` stay ad-only in practice —
// neither Product nor ServiceListing carries a city or condition column
// directly (city would need a join through StoreDetails/
// ServiceProviderDetails, out of scope for the same reason
// findAllForMatching's own doc comment gives for staying in-Node rather
// than pushing matching into SQL), so matchesFilters below only reads
// them when type === 'ads'. Left un-rejected here (rather than a
// refine() forbidding them for other types) so the schema doesn't need
// to change again if city/condition matching for products/services is
// ever added later — an extra key present but unused by matchesFilters
// is harmless.
export const savedSearchFiltersSchema = z
  .object({
    type: savedSearchTypeSchema,
    q: z.string().min(1).max(200).optional(),
    city: z.string().max(100).optional(),
    categoryId: z.string().optional(),
    condition: z.nativeEnum(AdCondition).optional(),
    minPrice: z.number().min(0).optional(),
    maxPrice: z.number().min(0).optional(),
  })
  .refine(
    (f) => f.minPrice === undefined || f.maxPrice === undefined || f.minPrice <= f.maxPrice,
    { message: 'minPrice must not exceed maxPrice', path: ['minPrice'] }
  )
  // At least one real criterion — an empty filter set would match every
  // future ad/product/service and turn into a de facto "notify me about
  // everything". `type` itself doesn't count (it's metadata, not a
  // criterion), so it's excluded from this check.
  .refine(
    (f) => Object.entries(f).some(([k, v]) => k !== 'type' && v !== undefined),
    { message: 'At least one filter is required' }
  );

export const createSavedSearchSchema = z.object({
  body: z.object({
    label: z.string().min(1, 'Label is required').max(100),
    filters: savedSearchFiltersSchema,
  }),
});

export const savedSearchIdSchema = z.object({
  params: z.object({ id: z.string().min(1, 'Saved search ID is required') }),
});

export type SavedSearchFilters = z.infer<typeof savedSearchFiltersSchema>;
export type CreateSavedSearchInput = z.infer<typeof createSavedSearchSchema>['body'];
