import { z } from 'zod';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

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
    // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3): `type` decides
    // which entity's recommendation rail to build — 'ad' when absent,
    // preserving GET /recommendations' exact pre-existing default
    // behavior/response shape for every caller that predates this
    // (frontend's recommendations.api.ts never sends `type`). 'store'
    // is deliberately not an option yet — see
    // recommendations.repository.ts's own comment on why StoreDetails
    // has no categoryId to weight by.
    type: z.enum(['ad', 'product', 'service']).optional(),
    // Type-specific "exclude + weight toward this one's category"
    // params, parallel to excludeAdId above. Kept as separate named
    // fields rather than one generic `excludeId` so each stays
    // self-documenting about which type it applies to, and so a
    // caller can't accidentally pass excludeAdId while type=product
    // and have it silently do nothing.
    excludeProductId: z.string().min(1).optional(),
    excludeServiceListingId: z.string().min(1).optional(),
  }),
});

export type GetRecommendationsQuery = z.infer<typeof getRecommendationsSchema>['query'];
