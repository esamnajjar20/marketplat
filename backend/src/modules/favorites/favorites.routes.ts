import { Router } from 'express';
import { favoritesController } from './favorites.controller';
import { favoriteListsController } from './favorite-lists.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { favoritesRateLimit } from '../../middlewares/rateLimit.middleware';

export const favoritesRouter = Router();

// Named lists — MUST register before /:adId so "lists" is not an adId
favoritesRouter.get('/lists', authenticate, favoriteListsController.list);
favoritesRouter.post('/lists', authenticate, favoriteListsController.create);
// FIX FAV-LISTS-RATELIMIT: rename/remove/moveFavorite had no rate
// limit while toggleFavorite below did. An authenticated user could
// loop any of the three arbitrarily — rename-flip spam, list churn,
// move-between-lists spam. Reused favoritesRateLimit (200/15min) as
// the closest fitting bucket; the operations are cheap but the ceiling
// still matters for the same reason every other mutation surface has
// one.
favoritesRouter.patch('/lists/:listId', authenticate, favoritesRateLimit, favoriteListsController.rename);
favoritesRouter.delete('/lists/:listId', authenticate, favoritesRateLimit, favoriteListsController.remove);
favoritesRouter.patch(
  '/items/:favoriteId/list',
  authenticate,
  favoritesRateLimit,
  favoriteListsController.moveFavorite
);

favoritesRouter.get('/', authenticate, favoritesController.getMyFavorites);
favoritesRouter.get('/:adId/check', authenticate, favoritesController.checkFavorited);
favoritesRouter.post('/:adId', authenticate, favoritesRateLimit, favoritesController.toggleFavorite);

// FEAT-FAVORITE-POLYMORPHIC PR2
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
