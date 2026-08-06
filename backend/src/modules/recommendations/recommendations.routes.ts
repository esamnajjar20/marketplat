import { Router } from 'express';
import { recommendationsController } from './recommendations.controller';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const recommendationsRouter = Router();

// Deliberately NOT behind `authenticate` — same reasoning as
// analytics.routes.ts's POST /events and ads.routes.ts's GET /ads:
// personalization is a bonus applied when a Bearer token happens to be
// present (see recommendations.service.ts's resolveOptionalUserId), not
// a requirement to see a "you might also like" rail at all.
//
// CACHE.NONE, not CACHE.SHORT: unlike GET /ads (identical response for
// every visitor at a given moment, hence cacheable), this response
// VARIES per caller — the Bearer token drives which ads come back, but
// Cache-Control has no way to key on an Authorization header. A public
// max-age here would let a CDN/browser serve one user's personalized
// rail to the next anonymous or different-user request that happens to
// land within the cache window — the same class of bug GET /ads/me
// avoids by using CACHE.NONE despite also being a GET.
recommendationsRouter.get('/', CACHE.NONE, recommendationsController.getRecommendations);
