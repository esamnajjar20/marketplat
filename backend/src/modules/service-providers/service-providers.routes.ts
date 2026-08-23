import { Router } from 'express';
import { serviceProvidersController } from './service-providers.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { uploadMiddleware } from '../../middlewares/upload.middleware';
import {
  createServiceProviderRateLimit,
  serviceProviderImagesRateLimit,
} from '../../middlewares/rateLimit.middleware';

export const serviceProvidersRouter = Router();

// Authenticated only — no role check, same as /sellers/me/profile. Any
// signed-in USER who already has a SellerProfile is eligible.
serviceProvidersRouter.get(
  '/me',
  authenticate,
  CACHE.NONE,
  serviceProvidersController.getMyServiceProvider
);
serviceProvidersRouter.post(
  '/me',
  authenticate,
  createServiceProviderRateLimit,
  serviceProvidersController.createServiceProvider
);
serviceProvidersRouter.patch(
  '/me',
  authenticate,
  CACHE.NONE,
  serviceProvidersController.updateMyServiceProvider
);

// ANALYTICS — owner-only. Registered alongside the other /me routes,
// same reasoning as /me/logo below: must never be swallowed by the
// public /:id route.
serviceProvidersRouter.get(
  '/me/analytics',
  authenticate,
  CACHE.NONE,
  serviceProvidersController.getMyServiceProviderAnalytics
);

// Logo upload — same single-image pattern as POST /users/me/avatar
// and /stores/me/logo. Registered alongside the other /me routes so
// it's never swallowed as the public /:id route below.
serviceProvidersRouter.post(
  '/me/logo',
  authenticate,
  serviceProviderImagesRateLimit,
  uploadMiddleware,
  serviceProvidersController.uploadLogo
);

// Public — city/browse directory (Home discovery plan, Phase 1).
// Mirrors GET /stores and GET /products: plain paginated list, city
// optional. Registered here (bare path) so it can never collide with
// /nearby or /:id regardless of ordering.
serviceProvidersRouter.get('/', CACHE.SHORT, serviceProvidersController.getServiceProviders);

// Public — nearby search must be registered before /:id so "nearby"
// isn't swallowed as an :id param, same ordering concern as ads' /search.
serviceProvidersRouter.get('/nearby', CACHE.SHORT, serviceProvidersController.getNearby);

// Public — anyone can view a service provider's page, no auth required.
serviceProvidersRouter.get('/:id', CACHE.MEDIUM, serviceProvidersController.getPublicServiceProvider);
