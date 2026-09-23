import { Request, Response, NextFunction } from 'express';
import { recommendationsService } from './recommendations.service';
import { getRecommendationsSchema } from './recommendations.validation';
import { successResponse } from '../../shared/types/api-response.types';

export const recommendationsController = {
  // GET /recommendations — public (see recommendations.routes.ts).
  // Personalizes automatically when a valid Bearer token is present,
  // same optional-auth posture as POST /analytics/events; falls back to
  // trending ads for anonymous visitors and any user with no signal
  // history yet. Never paginated — see recommendations.validation.ts's
  // own comment on why this is a fixed-size shelf, not a list endpoint.
  //
  // FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3, extended by PR4B):
  // `type` dispatches to one of four entity-specific service functions.
  // No `type` at all (the pre-existing default) → getRecommendations,
  // byte-identical to this endpoint's behavior before this change —
  // existing callers (frontend's recommendations.api.ts) never send
  // `type` and are unaffected.
  getRecommendations: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getRecommendationsSchema.parse({ query: req.query });
      const authHeader = req.headers.authorization;

      // T492 — CACHE.NONE on the route keeps our own layer from
      // caching, but an intermediary proxy in front of Cloudflare has
      // no way to know this response varies per Bearer. Advertising
      // Vary: Authorization is the standard signal that prevents such
      // a proxy from serving one user's rail to another.
      res.setHeader('Vary', 'Authorization');

      const items =
        query.type === 'product'
          ? await recommendationsService.getProductRecommendations(query, authHeader)
          : query.type === 'service'
            ? await recommendationsService.getServiceListingRecommendations(query, authHeader)
            : query.type === 'store'
              ? await recommendationsService.getStoreRecommendations(query, authHeader)
              : await recommendationsService.getRecommendations(query, authHeader);

      res.status(200).json(successResponse('Recommendations fetched', items));
    } catch (error) {
      next(error);
    }
  },
};
