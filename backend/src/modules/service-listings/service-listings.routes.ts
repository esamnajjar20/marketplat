import { Router } from 'express';
import { serviceListingsController } from './service-listings.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireVerifiedEmail } from '../../middlewares/requireVerifiedEmail.middleware';
import { uploadMultipleMiddleware } from '../../middlewares/upload.middleware';
import {
  createServiceListingRateLimit,
  addServiceListingImagesRateLimit,
} from '../../middlewares/rateLimit.middleware';
// FIX SL-MUTATION-LIMITS: PATCH/DELETE/reorder had no rate limit at all
// — same finding products got (see products.routes.ts's
// productMutationRateLimit). Reused createServiceListingRateLimit as
// the closest fitting bucket (30/hr).
const serviceListingMutationRateLimit = createServiceListingRateLimit;
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
serviceListingsRouter.get('/:id/matches', CACHE.SHORT, serviceListingsController.getServiceListingMatches);
serviceListingsRouter.get('/:id', CACHE.MEDIUM, serviceListingsController.getServiceListingById);

// Protected — owner-only, enforced in service-listings.service.ts
serviceListingsRouter.post(
  '/',
  authenticate, requireVerifiedEmail,
  createServiceListingRateLimit,
  uploadMultipleMiddleware,
  serviceListingsController.createServiceListing
);
// FIX SL-VERIFY-CONSISTENCY: PATCH/DELETE/reorder did not require a
// verified email while POST / and POST /:id/images did — same finding
// products got. All mutating routes now gate on the same rule.
serviceListingsRouter.patch(
  '/:id',
  authenticate, requireVerifiedEmail,
  serviceListingMutationRateLimit,
  serviceListingsController.updateServiceListing
);
// Gap #3 fix: closes the audit finding — mirrors ads.routes.ts's
// POST/DELETE /:id/images exactly.
serviceListingsRouter.post(
  '/:id/images',
  authenticate, requireVerifiedEmail,
  addServiceListingImagesRateLimit,
  uploadMultipleMiddleware,
  serviceListingsController.addImages
);
serviceListingsRouter.delete(
  '/:id/images',
  authenticate, requireVerifiedEmail,
  serviceListingMutationRateLimit,
  serviceListingsController.removeImage
);
// Gap #11: JSON body only (no files) — mirrors ads.routes.ts's reorder route.
serviceListingsRouter.put(
  '/:id/images/reorder',
  authenticate, requireVerifiedEmail,
  serviceListingMutationRateLimit,
  serviceListingsController.reorderImages
);
serviceListingsRouter.delete(
  '/:id',
  authenticate, requireVerifiedEmail,
  serviceListingMutationRateLimit,
  serviceListingsController.deleteServiceListing
);
