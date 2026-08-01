import { Router } from 'express';
import { conversationsController } from './conversations.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { startConversationRateLimit, sendMessageRateLimit } from '../../middlewares/rateLimit.middleware';

export const conversationsRouter = Router();

// All routes require auth — a conversation always belongs to a specific
// buyer/seller pair, never publicly listable (same posture as
// service-requests.routes.ts).
conversationsRouter.get('/', authenticate, CACHE.NONE, conversationsController.getMyConversations);
conversationsRouter.post(
  '/',
  authenticate,
  startConversationRateLimit,
  conversationsController.startConversation
);
conversationsRouter.get('/:id', authenticate, CACHE.NONE, conversationsController.getConversationById);
conversationsRouter.get(
  '/:id/messages',
  authenticate,
  CACHE.NONE,
  conversationsController.getMessages
);
conversationsRouter.post(
  '/:id/messages',
  authenticate,
  sendMessageRateLimit,
  conversationsController.sendMessage
);
