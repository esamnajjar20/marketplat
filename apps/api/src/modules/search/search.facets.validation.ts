/**
 * Validation for GET /search/facets
 *
 * Merge into search.validation.ts or import alongside searchQuerySchema.
 * Reuses the same base fields as search (without page/limit/sort — facets
 * are independent of pagination and sort).
 */

import { z } from 'zod';
import { SEARCH_TYPES } from './search.types';
import { optionalQueryNumber } from '../../../shared/utils/queryHelpers';

export const searchFacetsQuerySchema = z.object({
  query: z
    .object({
      q: z.string().min(1).max(200).optional(),
      city: z.string().max(100).optional(),
      type: z.enum(SEARCH_TYPES).default('all'),
      categoryId: z.string().optional(),
      minPrice: optionalQueryNumber(z.number().min(0)).optional(),
      maxPrice: optionalQueryNumber(z.number().min(0)).optional(),
      condition: z.enum(['NEW', 'USED', 'REFURBISHED']).optional(),
      lat: z.coerce.number().min(-90).max(90).optional(),
      lng: z.coerce.number().min(-180).max(180).optional(),
      radius: z.coerce.number().min(0.5).max(100).default(10),
    })
    .refine(
      (q) =>
        q.minPrice === undefined ||
        q.maxPrice === undefined ||
        q.minPrice <= q.maxPrice,
      { message: 'minPrice must not exceed maxPrice', path: ['minPrice'] },
    )
    .refine((q) => (q.lat === undefined) === (q.lng === undefined), {
      message: 'lat and lng must be provided together',
      path: ['lat'],
    }),
});

export type SearchFacetsQuery = z.infer<typeof searchFacetsQuerySchema>['query'];
