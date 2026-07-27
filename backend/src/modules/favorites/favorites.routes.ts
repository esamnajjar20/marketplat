import { Router } from 'express';
import { favoritesController } from './favorites.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { favoritesRateLimit } from '../../middlewares/rateLimit.middleware';

export const favoritesRouter = Router();

favoritesRouter.get('/', authenticate, favoritesController.getMyFavorites);
favoritesRouter.post('/:adId', authenticate, favoritesRateLimit, favoritesController.toggleFavorite);
