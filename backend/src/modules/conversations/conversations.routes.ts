import { uploadMiddleware } from '../../middlewares/upload.middleware';
import { Router } from 'express';
import { conversationsController } from './conversations.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireVerifiedEmail } from '../../middlewares/requireVerifiedEmail.middleware';
import { CACHE } from '../../middlewares/cacheControl.middleware';
import { startConversationRateLimit, sendMessageRateLimit, typingRateLimit } from '../../middlewares/rateLimit.middleware';

export const conversationsRouter = Router();

// All routes require auth — a conversation always belongs to a specific
// buyer/seller pair, never publicly listable (same posture as
// service-requests.routes.ts).
conversationsRouter.get('/', authenticate, CACHE.NONE, conversationsController.getMyConversations);
// Static path before /:id so "unread-count" is not captured as an id.
conversationsRouter.get(
  '/unread-count',
  authenticate,
  CACHE.NONE,
  conversationsController.getUnreadCount
);
conversationsRouter.post(
  '/',
  authenticate, requireVerifiedEmail,
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
conversationsRouter.post(
  '/:id/messages/image',
  authenticate,
  sendMessageRateLimit,
  uploadMiddleware,
  conversationsController.sendMessageImage
);
conversationsRouter.delete(
  '/:id/messages/:messageId',
  authenticate,
  conversationsController.deleteMessage
);
conversationsRouter.patch(
  '/:id/flags',
  authenticate,
  conversationsController.setFlags
);
// FIX TYPING-RATE-LIMIT-01: rate-limited now. See typingRateLimit's
// own comment for why it's a separate bucket from send_message and why
// the budget is 600/15min rather than sendMessage's 60.
conversationsRouter.post(
  '/:id/typing',
  authenticate,
  typingRateLimit,
  conversationsController.typing
);
