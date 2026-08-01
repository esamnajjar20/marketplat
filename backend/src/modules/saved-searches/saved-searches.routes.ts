import { Router } from 'express';
import { savedSearchesController } from './saved-searches.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { savedSearchRateLimit } from '../../middlewares/rateLimit.middleware';

export const savedSearchesRouter = Router();

savedSearchesRouter.get('/', authenticate, savedSearchesController.getMySavedSearches);
savedSearchesRouter.post(
  '/',
  authenticate,
  savedSearchRateLimit,
  savedSearchesController.createSavedSearch
);
savedSearchesRouter.delete('/:id', authenticate, savedSearchesController.deleteSavedSearch);
