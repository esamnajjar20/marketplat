import { z } from 'zod';
import { optionalQueryNumber } from '../../shared/utils/queryHelpers';

// Gap #9 ("قد يعجبك أيضًا" / Recommendations): GET /recommendations is a
// single flat "how many" request, not a paginated list — a recommendation
// rail is a fixed-size shelf on a page (home feed, ad detail sidebar),
// never something a user pages through. Same reasoning as
// ads.validation.ts's adIdSchema.params being minimal: keep the surface
// area exactly as small as the one real caller shape needs.
const getRecommendationsQueryObjectSchema = z.object({
  // T489 — .int() required: without it a fractional limit (e.g. 5.5)
  // passes validation and reaches Prisma's .take(), which expects an
  // integer and rejects/rounds unpredictably. Every other schema in
  // this codebase uses .int() on its limit field.
  limit: optionalQueryNumber(z.number().int().min(1).max(24)),
  // Optional: when present, recommendations are generated as
  // "related to this ad" (used on the ad-detail page) instead of the
  // general personalized/trending feed (used on the home page).
  // Deliberately a plain string, not adIdSchema's z.string().min(1)
  // reused — this field is optional so it needs its own .optional(),
  // and recommendationsService.getRecommendations already 404s via
  // adsService.findAdForReference if the id doesn't resolve to a real
  // ad, so no extra format validation earns its keep here.
  excludeAdId: z.string().min(1).optional(),
  // أولوية المدينة: إن وُجدت تُفضَّل نتائج نفس المدينة في الترتيب
  city: z.string().min(1).max(100).optional(),
  // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3): `type` decides
  // which entity's recommendation rail to build — 'ad' when absent,
  // preserving GET /recommendations' exact pre-existing default
  // behavior/response shape for every caller that predates this
  // (frontend's recommendations.api.ts never sends `type`).
  //
  // PR4B: 'store' added — see recommendations.repository.ts's
  // storeRecommendationsRepository for why it doesn't reuse the
  // CategoryWeight engine the other three types share.
  type: z.enum(['ad', 'product', 'service', 'store']).optional(),
  // Type-specific "exclude + weight toward this one's category"
  // params, parallel to excludeAdId above. Kept as separate named
  // fields rather than one generic `excludeId` so each stays
  // self-documenting about which type it applies to, and so a
  // caller can't accidentally pass excludeAdId while type=product
  // and have it silently do nothing.
  excludeProductId: z.string().min(1).optional(),
  excludeServiceListingId: z.string().min(1).optional(),
  // PR4B: store-detail-page mode, same "exclude this one" role
  // excludeAdId/excludeProductId/excludeServiceListingId already
  // play — NOT a weighting signal (storeRecommendationsRepository has
  // no per-store category to weight toward), just a plain exclusion
  // so a future "similar stores" rail on a store's own detail page
  // never recommends itself. PR4C decides whether the frontend ever
  // actually sends this; the backend contract supports it either way.
  excludeStoreId: z.string().min(1).optional(),
  // PR4B: optional caller-supplied coordinates for the location/
  // distance ranking signal — same bounds as search.validation.ts's
  // own lat/lng (z.coerce, mirroring that file's convention exactly).
  // Only `type=store` reads these today; harmless no-ops for the
  // other three types.
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
}).refine(q => (q.lat === undefined) === (q.lng === undefined), {
  message: 'lat and lng must be provided together',
  path: ['lat'],
});

export const getRecommendationsSchema = z.object({ query: getRecommendationsQueryObjectSchema });

export type GetRecommendationsQuery = z.infer<typeof getRecommendationsQueryObjectSchema>;
