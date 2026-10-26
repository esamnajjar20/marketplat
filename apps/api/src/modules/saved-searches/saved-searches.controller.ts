import { Request, Response, NextFunction } from 'express';
import { savedSearchesService } from './saved-searches.service';
import { createSavedSearchSchema, savedSearchIdSchema } from './saved-searches.validation';
import { successResponse } from '../../shared/types/api-response.types';
import { requireUser } from '../../shared/utils/requireUser';

export const savedSearchesController = {
  getMySavedSearches: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const searches = await savedSearchesService.getMySavedSearches(user.userId);
      res.status(200).json(successResponse('Saved searches fetched', searches));
    } catch (error) {
      next(error);
    }
  },

  createSavedSearch: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { body } = createSavedSearchSchema.parse({ body: req.body });
      const search = await savedSearchesService.createSavedSearch(user.userId, body);
      res.status(201).json(successResponse('Saved search created', search));
    } catch (error) {
      next(error);
    }
  },

  deleteSavedSearch: async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = requireUser(req);
      const { params } = savedSearchIdSchema.parse({ params: req.params });
      await savedSearchesService.deleteSavedSearch(params.id, user.userId);
      res.status(200).json(successResponse('Saved search deleted', null));
    } catch (error) {
      next(error);
    }
  },
};
