import { Router } from 'express';
import { badgesController } from './badges.controller';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const badgesRouter = Router();

// Public only — badges have no owner-facing CRUD; they're entirely
// derived from data other modules already own (SellerProfile,
// StoreReview, StoreDetails), so there is nothing here for an owner to
// create/edit directly.
badgesRouter.get('/store/:storeId', CACHE.SHORT, badgesController.getStoreBadges);
badgesRouter.get('/provider/:providerId', CACHE.SHORT, badgesController.getProviderBadges);
