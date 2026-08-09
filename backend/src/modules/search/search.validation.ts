import { z } from 'zod';
import { SEARCH_TYPES, SEARCH_SORT_OPTIONS } from './search.types';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

// Same "absent vs empty string" distinction as ads.validation.ts's
// getAdsSchema.search field (FIX AUDIT-V3-08) — .min(1) rejects an
// explicit q='' with a clear 400 instead of silently falling through
// to an unfiltered browse.
//
// TRACK-NEARBY-SEARCH: lat/lng/radius mirror
// service-providers.validation.ts's nearbyServiceProvidersSchema
// exactly (same bounds, same default/cap on radius) rather than
// inventing a second convention — both search.repository.ts's nearby
// branches and service-providers.repository.ts's findNearby feed the
// same Haversine/bounding-box shape from these three values. Unlike
// that endpoint, lat/lng are optional here: this module's GET /search
// stays a single endpoint for both plain and geo search (adding lat/lng
// just enables `sort=distance` and a `distanceKm` on each result)
// rather than splitting into a second /search/nearby route.
const baseSearchQuerySchema = z.object({
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
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().min(0.5).max(100).default(10),
});

const searchQueryObjectSchema = baseSearchQuerySchema
  .refine(q => (q.lat === undefined) === (q.lng === undefined), {
    message: 'lat and lng must be provided together',
    path: ['lat'],
  })
  .refine(q => q.sort !== 'distance' || (q.lat !== undefined && q.lng !== undefined), {
    message: 'sort=distance requires lat and lng',
    path: ['sort'],
  });

export const searchQuerySchema = z.object({
  query: searchQueryObjectSchema,
});

export type SearchQuery = z.infer<typeof searchQueryObjectSchema>;

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

