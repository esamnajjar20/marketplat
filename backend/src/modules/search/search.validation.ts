import { z } from 'zod';
import { SEARCH_TYPES, SEARCH_SORT_OPTIONS } from './search.types';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

// Same "absent vs empty string" distinction as ads.validation.ts's
// getAdsSchema.search field (FIX AUDIT-V3-08) — .min(1) rejects an
// explicit q='' with a clear 400 instead of silently falling through
// to an unfiltered browse.
export const searchQuerySchema = z.object({
  query: z.object({
    q: z.string().min(1).max(200).optional(),
    city: z.string().max(100).optional(),
    type: z.enum(SEARCH_TYPES).default('all'),
    categoryId: z.string().optional(),
    sort: z.enum(SEARCH_SORT_OPTIONS).default('relevance'),
    page: optionalQueryNumber(z.number().int().min(1).max(1000)),
    // Capped lower than ads.validation.ts's own limit (100) — each row
    // here costs a 4-way UNION + JOIN across ads/products/store_details/
    // service_listings rather than one table, so the same limit would
    // be meaningfully heavier per request.
    limit: optionalQueryNumber(z.number().int().min(1).max(50)),
  }),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>['query'];

// Autocomplete is a much tighter surface than the main search — short
// prefix, no filters, small fixed result count. A separate schema
// (not a subset of searchQuerySchema) because it has genuinely
// different constraints: q is required here (an empty-prefix
// autocomplete call is never useful) and there's no pagination/sort/type.
export const searchSuggestionsQuerySchema = z.object({
  query: z.object({
    q: z.string().min(1, 'Search query is required').max(100),
  }),
});

export type SearchSuggestionsQuery = z.infer<typeof searchSuggestionsQuerySchema>['query'];
