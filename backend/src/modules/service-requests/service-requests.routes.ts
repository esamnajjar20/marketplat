import { Router } from 'express';
import { serviceRequestsController } from './service-requests.controller';
import { authenticate } from '../../middlewares/auth.middleware';
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
  authenticate,
  createServiceRequestRateLimit,
  serviceRequestsController.createRequest
);
serviceRequestsRouter.patch('/:id/respond', authenticate, serviceRequestsController.respondToRequest);
