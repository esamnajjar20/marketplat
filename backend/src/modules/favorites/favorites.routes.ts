import { Router } from 'express';
import { favoritesController } from './favorites.controller';
import { favoriteListsController } from './favorite-lists.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { favoritesRateLimit } from '../../middlewares/rateLimit.middleware';

export const favoritesRouter = Router();

// Named lists — MUST register before /:adId so "lists" is not an adId
favoritesRouter.get('/lists', authenticate, favoriteListsController.list);
favoritesRouter.post('/lists', authenticate, favoriteListsController.create);
favoritesRouter.patch('/lists/:listId', authenticate, favoriteListsController.rename);
favoritesRouter.delete('/lists/:listId', authenticate, favoriteListsController.remove);
favoritesRouter.patch(
  '/items/:favoriteId/list',
  authenticate,
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
