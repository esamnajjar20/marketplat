import { z } from 'zod';
import { AdCondition } from '@prisma/client';

// Filters mirror ads.validation.ts's getAdsSchema query shape — kept as a
// deliberately separate schema (not an import/reuse of getAdsSchema)
// because this one is validating a *stored* filter payload, not live
// query-string params: no page/limit/sortBy/sortOrder here (a saved
// search is a matching criteria set, not a paginated request), and
// numeric fields arrive as real JSON numbers from the request body
// rather than strings that need coercion from a query string.
export const savedSearchFiltersSchema = z
  .object({
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
  // future ad and turn into a de facto "notify me about everything".
  .refine(
    (f) => Object.values(f).some((v) => v !== undefined),
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
