import { uploadMiddleware, uploadAudioMiddleware, uploadMessageFileMiddleware } from '../../middlewares/upload.middleware';
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
conversationsRouter.get(
  '/:id/messages/media',
  authenticate,
  CACHE.NONE,
  conversationsController.getMedia
);
conversationsRouter.get(
  '/:id/messages/:messageId/media/:kind',
  authenticate,
  CACHE.NONE,
  conversationsController.getMediaAsset
);
conversationsRouter.post(
  '/:id/messages',
  authenticate,
  // FIX MSG-VERIFY-CONSISTENCY: the image-send route below already
  // required a verified email, but this text path did not — a user
  // with an unverified email could send text messages but not images,
  // which reads as "the image button is broken" rather than "your
  // email needs verification". Both message paths now gate on the same
  // rule. Cheap to revert if the product decision is text-only
  // messaging should be allowed pre-verification.
  requireVerifiedEmail,
  sendMessageRateLimit,
  conversationsController.sendMessage
);
conversationsRouter.post(
  '/:id/messages/file',
  authenticate,
  requireVerifiedEmail,
  sendMessageRateLimit,
  uploadMessageFileMiddleware,
  conversationsController.sendMessageFile
);
conversationsRouter.post(
  '/:id/messages/audio',
  authenticate,
  requireVerifiedEmail,
  sendMessageRateLimit,
  uploadAudioMiddleware,
  conversationsController.sendMessageAudio
);
conversationsRouter.post(
  '/:id/messages/image',
  authenticate,
  sendMessageRateLimit,
  uploadMiddleware,
  conversationsController.sendMessageImage
);
conversationsRouter.post('/:id/messages/:messageId/pin', authenticate, sendMessageRateLimit, conversationsController.pinMessage);
conversationsRouter.delete('/:id/messages/:messageId/pin', authenticate, sendMessageRateLimit, conversationsController.unpinMessage);
conversationsRouter.post('/:id/messages/:messageId/star', authenticate, sendMessageRateLimit, conversationsController.starMessage);
conversationsRouter.delete('/:id/messages/:messageId/star', authenticate, sendMessageRateLimit, conversationsController.unstarMessage);

conversationsRouter.delete(
  '/:id/messages/:messageId',
  authenticate,
  // FIX CONV-MUTATION-LIMITS: neither deleteMessage nor setFlags below
  // had any rate limit — an authenticated caller could loop either
  // endpoint arbitrarily. Reused sendMessageRateLimit as the closest
  // fitting bucket: same per-conversation mutation class, same
  // 200/15min ceiling. Separate buckets would be cleaner but this is
  // the right shape without adding two more limiter definitions to
  // rateLimit.middleware.ts.
  sendMessageRateLimit,
  conversationsController.deleteMessage
);
conversationsRouter.delete('/:id', authenticate, sendMessageRateLimit, conversationsController.deleteConversation);
conversationsRouter.patch(
  '/:id/flags',
  authenticate,
  sendMessageRateLimit,
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
