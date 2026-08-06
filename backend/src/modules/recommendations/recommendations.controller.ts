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
  getRecommendations: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { query } = getRecommendationsSchema.parse({ query: req.query });
      const ads = await recommendationsService.getRecommendations(
        query,
        req.headers.authorization
      );
      res.status(200).json(successResponse('Recommendations fetched', ads));
    } catch (error) {
      next(error);
    }
  },
};
