import { z } from 'zod';

/**
 * GET /home — aggregates above-the-fold and static below-the-fold
 * homepage sections into one round trip.
 *
 * `city` optional: ads + products/stores/services/providers city variants.
 *
 * NOT included: personalized recommendations (public Cache-Control).
 */
export const getHomepageSchema = z.object({
  query: z.object({
    city: z.string().max(100).optional(),
  }),
});

export type GetHomepageQuery = z.infer<typeof getHomepageSchema>['query'];
