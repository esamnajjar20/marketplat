import { requireVerifiedEmail } from '../../middlewares/requireVerifiedEmail.middleware';
import { Router } from 'express';
import { requestsController } from './requests.controller';
import { authenticate, optionalAuthenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import {
  createOpenRequestRateLimit,
  submitRequestOfferRateLimit,
  cancelRequestRateLimit,
  withdrawOfferRateLimit,
  acceptOfferRateLimit,
} from '../../middlewares/rateLimit.middleware';

export const requestsRouter = Router();

// Open marketplace requests (SERVICE | PRODUCT | RENTAL). Distinct from
// /service-requests (directed) and /service-broadcasts (service-only legacy).
requestsRouter.get('/', optionalAuthenticate, CACHE.SHORT, requestsController.getOpenFeed);
requestsRouter.get('/me', authenticate, CACHE.NONE, requestsController.getMyRequests);
requestsRouter.get('/offers/me', authenticate, CACHE.NONE, requestsController.getMyOffers);
requestsRouter.get('/:id', optionalAuthenticate, CACHE.NONE, requestsController.getById);

requestsRouter.post('/', authenticate, requireVerifiedEmail, createOpenRequestRateLimit, requestsController.create);
requestsRouter.patch('/:id/cancel', authenticate, cancelRequestRateLimit, requestsController.cancel);

requestsRouter.post(
  '/:id/offers',
  authenticate, requireVerifiedEmail,
  submitRequestOfferRateLimit,
  requestsController.submitOffer,
);
requestsRouter.delete('/:id/offers/:offerId', authenticate, withdrawOfferRateLimit, requestsController.withdrawOffer);
requestsRouter.patch('/:id/offers/:offerId/accept', authenticate, acceptOfferRateLimit, requestsController.acceptOffer);
