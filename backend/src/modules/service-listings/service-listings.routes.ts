import { Router } from 'express';
import { serviceListingsController } from './service-listings.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { uploadMultipleMiddleware } from '../../middlewares/upload.middleware';
import {
  createServiceListingRateLimit,
  addServiceListingImagesRateLimit,
} from '../../middlewares/rateLimit.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';

export const serviceListingsRouter = Router();

// Public
serviceListingsRouter.get('/', CACHE.SHORT, serviceListingsController.getServiceListings);
// Registered before /:id so "me" is never swallowed as an :id param.
serviceListingsRouter.get(
  '/me',
  authenticate,
  CACHE.NONE,
  serviceListingsController.getMyServiceListings
);
serviceListingsRouter.get('/:id', CACHE.MEDIUM, serviceListingsController.getServiceListingById);

// Protected — owner-only, enforced in service-listings.service.ts
serviceListingsRouter.post(
  '/',
  authenticate,
  createServiceListingRateLimit,
  uploadMultipleMiddleware,
  serviceListingsController.createServiceListing
);
serviceListingsRouter.patch('/:id', authenticate, serviceListingsController.updateServiceListing);
// Gap #3 fix: closes the audit finding — mirrors ads.routes.ts's
// POST/DELETE /:id/images exactly.
serviceListingsRouter.post(
  '/:id/images',
  authenticate,
  addServiceListingImagesRateLimit,
  uploadMultipleMiddleware,
  serviceListingsController.addImages
);
serviceListingsRouter.delete('/:id/images', authenticate, serviceListingsController.removeImage);
serviceListingsRouter.delete('/:id', authenticate, serviceListingsController.deleteServiceListing);
