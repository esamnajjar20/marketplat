import { Router } from 'express';
import { serviceRequestsController } from './service-requests.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireVerifiedEmail } from '../../middlewares/requireVerifiedEmail.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { createServiceRequestRateLimit } from '../../middlewares/rateLimit.middleware';

export const serviceRequestsRouter = Router();

// All routes require auth — a service request always belongs to a
// specific customer/provider pair, never publicly listable.
serviceRequestsRouter.get(
  '/me',
  authenticate,
  CACHE.NONE,
  serviceRequestsController.getMyRequestsAsCustomer
);
serviceRequestsRouter.get(
  '/incoming',
  authenticate,
  CACHE.NONE,
  serviceRequestsController.getMyRequestsAsProvider
);
serviceRequestsRouter.get('/:id', authenticate, CACHE.NONE, serviceRequestsController.getRequestById);

serviceRequestsRouter.post(
  '/',
  authenticate, requireVerifiedEmail,
  createServiceRequestRateLimit,
  serviceRequestsController.createRequest
);
// FIX SR-RESPOND-LIMITS: respond was the only mutating route in this
// router without requireVerifiedEmail or a rate limit, while POST /
// (creation) had both. The transition is the more sensitive of the two
// — it moves quoted/agreed prices and flips the provider's lifetime
// counters (completedRequestsCount, fulfillmentRate) — so gating it
// more loosely than creation made no sense. Reused
// createServiceRequestRateLimit (20/hr) as the closest fitting bucket;
// the transition set is small enough that one shared limit is fine.
serviceRequestsRouter.patch(
  '/:id/respond',
  authenticate, requireVerifiedEmail,
  createServiceRequestRateLimit,
  serviceRequestsController.respondToRequest
);
