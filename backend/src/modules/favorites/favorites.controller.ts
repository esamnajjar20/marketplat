import { Request, Response, NextFunction } from 'express';
import { favoritesService } from './favorites.service';
import { favoriteAdSchema, favoriteEntitySchema, getFavoritesSchema } from './favorites.validation';
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

  // FEAT-FAVORITE-POLYMORPHIC PR2: generic counterpart of
  // toggleFavorite above, for POST /favorites/:entityType/:entityId
  // (products/stores/services — see favorites.validation.ts's URL
  // param mapping).
  toggleFavoriteEntity: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = favoriteEntitySchema.parse({ params: req.params });
      const result = await favoritesService.toggleFavoriteEntity(
        user.userId,
        params.entityType,
        params.entityId
      );
      const message = result.action === 'added' ? 'Added to favorites' : 'Removed from favorites';
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

  // UX-FIX (frontend audit P2-03): single-ad check, replacing the
  // frontend's previous workaround of paging through up to 100
  // favorites to answer one boolean. Reuses favoriteAdSchema — same
  // { adId } param shape the toggle route already validates.
  checkFavorited: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = favoriteAdSchema.parse({ params: req.params });
      const isFavorited = await favoritesService.isFavorited(user.userId, params.adId);
      res.status(200).json(successResponse('Favorite status fetched', { isFavorited }));
    } catch (error) {
      next(error);
    }
  },

  // FEAT-FAVORITE-POLYMORPHIC PR2: generic counterpart of
  // checkFavorited above.
  checkFavoritedEntity: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = favoriteEntitySchema.parse({ params: req.params });
      const isFavorited = await favoritesService.isFavoritedEntity(
        user.userId,
        params.entityType,
        params.entityId
      );
      res.status(200).json(successResponse('Favorite status fetched', { isFavorited }));
    } catch (error) {
      next(error);
    }
  },
};
