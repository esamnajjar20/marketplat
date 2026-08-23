import { Router } from 'express';
import { serviceBroadcastsController } from './service-broadcasts.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { createServiceBroadcastRateLimit, submitServiceQuoteRateLimit } from '../../middlewares/rateLimit.middleware';

export const serviceBroadcastsRouter = Router();

// SERVICE REQUEST MARKETPLACE. Unlike service-requests.routes.ts (fully
// private, customer/provider pair only), the open feed and a
// broadcast's own detail (including its quotes) are visible to any
// authenticated user — see service-broadcasts.service.ts's getById doc
// comment for why quote-visibility is intentional here.
serviceBroadcastsRouter.get('/', authenticate, CACHE.SHORT, serviceBroadcastsController.getOpenFeed);
serviceBroadcastsRouter.get('/me', authenticate, CACHE.NONE, serviceBroadcastsController.getMyBroadcasts);
serviceBroadcastsRouter.get('/quotes/me', authenticate, CACHE.NONE, serviceBroadcastsController.getMyQuotes);
serviceBroadcastsRouter.get('/:id', authenticate, CACHE.NONE, serviceBroadcastsController.getById);

serviceBroadcastsRouter.post(
  '/',
  authenticate,
  createServiceBroadcastRateLimit,
  serviceBroadcastsController.create
);
serviceBroadcastsRouter.patch('/:id/cancel', authenticate, serviceBroadcastsController.cancel);

serviceBroadcastsRouter.post(
  '/:id/quotes',
  authenticate,
  submitServiceQuoteRateLimit,
  serviceBroadcastsController.submitQuote
);
serviceBroadcastsRouter.delete('/:id/quotes/:quoteId', authenticate, serviceBroadcastsController.withdrawQuote);
serviceBroadcastsRouter.patch(
  '/:id/quotes/:quoteId/accept',
  authenticate,
  serviceBroadcastsController.acceptQuote
);
