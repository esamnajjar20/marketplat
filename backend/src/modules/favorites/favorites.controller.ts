import { Request, Response, NextFunction } from 'express';
import { favoritesService } from './favorites.service';
import { favoriteAdSchema, getFavoritesSchema } from './favorites.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const favoritesController = {
  toggleFavorite: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = favoriteAdSchema.parse({ params: req.params });
      const result = await favoritesService.toggleFavorite(user.userId, params.adId);
      const message =
        result.action === 'added' ? 'Ad saved to favorites' : 'Ad removed from favorites';
      res.status(200).json(successResponse(message, result));
    } catch (error) {
      next(error);
    }
  },

  getMyFavorites: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { query } = getFavoritesSchema.parse({ query: req.query });
      const result = await favoritesService.getMyFavorites(user.userId, query);
      res
        .status(200)
        .json(successResponse('Favorites fetched', result.items, { pagination: result.meta }));
    } catch (error) {
      next(error);
    }
  },
};
