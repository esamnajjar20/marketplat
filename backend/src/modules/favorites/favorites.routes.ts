import { Router } from 'express';
import { favoritesController } from './favorites.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { favoritesRateLimit } from '../../middlewares/rateLimit.middleware';

export const favoritesRouter = Router();

favoritesRouter.get('/', authenticate, favoritesController.getMyFavorites);
favoritesRouter.get('/:adId/check', authenticate, favoritesController.checkFavorited);
favoritesRouter.post('/:adId', authenticate, favoritesRateLimit, favoritesController.toggleFavorite);

// FEAT-FAVORITE-POLYMORPHIC PR2: generic routes for products/stores/
// services (see favorites.validation.ts's ENTITY_TYPE_PARAM_MAP for
// the accepted :entityType values). Different path arity from the
// legacy AD-only routes above (2/3 segments vs 1/2), so there's no
// routing ambiguity between them — both sets can register in either
// order.
favoritesRouter.get(
  '/:entityType/:entityId/check',
  authenticate,
  favoritesController.checkFavoritedEntity
);
favoritesRouter.post(
  '/:entityType/:entityId',
  authenticate,
  favoritesRateLimit,
  favoritesController.toggleFavoriteEntity
);
