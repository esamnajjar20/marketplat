import { Router } from 'express';
import { serviceProvidersController } from './service-providers.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { createServiceProviderRateLimit } from '../../middlewares/rateLimit.middleware';

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

// Public — nearby search must be registered before /:id so "nearby"
// isn't swallowed as an :id param, same ordering concern as ads' /search.
serviceProvidersRouter.get('/nearby', CACHE.SHORT, serviceProvidersController.getNearby);

// Public — anyone can view a service provider's page, no auth required.
serviceProvidersRouter.get('/:id', CACHE.MEDIUM, serviceProvidersController.getPublicServiceProvider);
