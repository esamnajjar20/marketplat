import { z } from 'zod';

const optionalQueryNumber = (schema: z.ZodNumber) =>
  z.preprocess(value => (value === undefined ? undefined : Number(value)), schema.optional());

// Gap #9 ("قد يعجبك أيضًا" / Recommendations): GET /recommendations is a
// single flat "how many" request, not a paginated list — a recommendation
// rail is a fixed-size shelf on a page (home feed, ad detail sidebar),
// never something a user pages through. Same reasoning as
// ads.validation.ts's adIdSchema.params being minimal: keep the surface
// area exactly as small as the one real caller shape needs.
export const getRecommendationsSchema = z.object({
  query: z.object({
    limit: optionalQueryNumber(z.number().min(1).max(24)),
    // Optional: when present, recommendations are generated as
    // "related to this ad" (used on the ad-detail page) instead of the
    // general personalized/trending feed (used on the home page).
    // Deliberately a plain string, not adIdSchema's z.string().min(1)
    // reused — this field is optional so it needs its own .optional(),
    // and recommendationsService.getRecommendations already 404s via
    // adsService.findAdForReference if the id doesn't resolve to a real
    // ad, so no extra format validation earns its keep here.
    excludeAdId: z.string().min(1).optional(),
  }),
});

export type GetRecommendationsQuery = z.infer<typeof getRecommendationsSchema>['query'];
