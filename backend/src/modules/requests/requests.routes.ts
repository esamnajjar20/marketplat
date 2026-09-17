import { Router } from 'express';
import { requestsController } from './requests.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { createOpenRequestRateLimit, submitRequestOfferRateLimit } from '../../middlewares/rateLimit.middleware';

export const requestsRouter = Router();

// Open marketplace requests (SERVICE | PRODUCT | RENTAL). Distinct from
// /service-requests (directed) and /service-broadcasts (service-only legacy).
requestsRouter.get('/', authenticate, CACHE.SHORT, requestsController.getOpenFeed);
requestsRouter.get('/me', authenticate, CACHE.NONE, requestsController.getMyRequests);
requestsRouter.get('/offers/me', authenticate, CACHE.NONE, requestsController.getMyOffers);
requestsRouter.get('/:id', authenticate, CACHE.NONE, requestsController.getById);

requestsRouter.post('/', authenticate, createOpenRequestRateLimit, requestsController.create);
requestsRouter.patch('/:id/cancel', authenticate, requestsController.cancel);

requestsRouter.post(
  '/:id/offers',
  authenticate,
  submitRequestOfferRateLimit,
  requestsController.submitOffer,
);
requestsRouter.delete('/:id/offers/:offerId', authenticate, requestsController.withdrawOffer);
requestsRouter.patch('/:id/offers/:offerId/accept', authenticate, requestsController.acceptOffer);
