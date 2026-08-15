import { Conversation, Message } from '@prisma/client';
import { conversationsRepository, messagesRepository, ConversationWithRelations, ConversationListItem } from './conversations.repository';
import { adsRepository } from '../ads/ads.repository';
import { usersRepository } from '../users/users.repository';
import { notificationEvents } from '../notifications';
import { blockedUsersService } from '../blocked-users';
import { activityService, activityTemplates } from '../activity';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { logger } from '../../shared/utils/logger';

const assertParty = (conversation: Conversation, userId: string): void => {
  if (conversation.buyerId !== userId && conversation.sellerId !== userId) {
    throw new ForbiddenError('You are not a party to this conversation.', 'NOT_YOUR_CONVERSATION');
  }
};

/** Strips `body` from a soft-deleted message before it ever leaves the
 * service layer — the row itself stays in place (see Message.deletedAt's
 * schema comment) so the thread keeps its placeholder in the right slot,
 * but the actual text must never reach a client response once deleted,
 * for either party. Applied at every read path, not just deleteMessage's
 * own response, since a message can be deleted by one party and then
 * read by the other via getMessages moments later. */
const redactIfDeleted = (message: Message): Message =>
  message.deletedAt ? { ...message, body: '' } : message;

export const conversationsService = {
  /**
   * Starts (or reopens) a thread about a specific ad. The only entry
   * point in the current UI (SellerCard's "مراسلة البائع") always
   * supplies an adId — this resolves the ad's owner as the seller side
   * and the caller as the buyer side, then reuses the existing thread
   * for that (ad, buyer, seller) triple if one already exists rather
   * than creating a duplicate — same idempotent-create shape as
   * sellers.service's own profile-creation guard.
   */
  startFromAd: async (buyerId: string, adId: string): Promise<Conversation> => {
    const ad = await adsRepository.findById(adId);
    if (!ad || ad.status === 'DELETED') {
      throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
    }

    const sellerId = ad.userId;
    if (sellerId === buyerId) {
      throw new BadRequestError('You cannot message yourself about your own ad.', 'CANNOT_MESSAGE_SELF');
    }

    // Checked in either direction — a blocked user shouldn't be able to
    // start a fresh thread with the person who blocked them, nor should
    // the blocker be able to (re)start one with someone they blocked.
    if (await blockedUsersService.isBlockedEitherDirection(buyerId, sellerId)) {
      throw new ForbiddenError('You cannot message this user.', 'USER_BLOCKED');
    }

    const existing = await conversationsRepository.findExisting(adId, buyerId, sellerId);
    if (existing) return existing;

    return conversationsRepository.create(adId, buyerId, sellerId);
  },

  /**
   * Starts (or reopens) a thread directly with a user, with no ad in
   * context — PublicProfileHeader's "مراسلة" button, for a visitor who
   * wants to reach someone without going through one of their listings
   * first. Mirrors startFromAd's guard order (self-message, then block
   * check, then idempotent reuse) but resolves the target user instead
   * of an ad, and uses findExistingWithoutAd since the ad-based unique
   * lookup doesn't apply when adId is null.
   */
  startFromUser: async (buyerId: string, targetUserId: string): Promise<Conversation> => {
    const target = await usersRepository.findPublicById(targetUserId);
    if (!target || !target.isActive) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    const sellerId = target.id;
    if (sellerId === buyerId) {
      throw new BadRequestError('You cannot message yourself.', 'CANNOT_MESSAGE_SELF');
    }

    if (await blockedUsersService.isBlockedEitherDirection(buyerId, sellerId)) {
      throw new ForbiddenError('You cannot message this user.', 'USER_BLOCKED');
    }

    const existing = await conversationsRepository.findExistingWithoutAd(buyerId, sellerId);
    if (existing) return existing;

    return conversationsRepository.create(null, buyerId, sellerId);
  },

  getConversationById: async (userId: string, id: string): Promise<ConversationWithRelations> => {
    const conversation = await conversationsRepository.findById(id);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    return conversation;
  },

  getMyConversations: async (
    userId: string,
    query: { page?: number; limit?: number }
  ): Promise<PaginatedResult<ConversationListItem>> => {
    const { conversations, total } = await conversationsRepository.findManyForUser(userId, query);
    return {
      items: conversations,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  sendMessage: async (userId: string, conversationId: string, body: string): Promise<Message> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);

    // A block applies to an existing thread too, not just to starting a
    // new one — otherwise blocking would only stop future conversations
    // while leaving every already-open thread free to keep receiving
    // messages, which defeats the point of blocking someone you're
    // already talking to.
    const otherPartyId = conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
    if (await blockedUsersService.isBlockedEitherDirection(userId, otherPartyId)) {
      throw new ForbiddenError('You cannot message this user.', 'USER_BLOCKED');
    }

    const [message] = await Promise.all([
      messagesRepository.create(conversationId, userId, body),
      conversationsRepository.touchUpdatedAt(conversationId),
    ]);

    // Fire-and-forget per notificationEvents' own contract: a
    // notification failing to write must never fail message sending,
    // which has already succeeded above. Notify whichever party is NOT
    // the sender.
    const recipient = conversation.buyerId === userId ? conversation.seller : conversation.buyer;
    const sender = conversation.buyerId === userId ? conversation.buyer : conversation.seller;
    notificationEvents
      .onNewMessage(recipient.id, conversationId, sender.name)
      .catch((err) => logger.error('Failed to create NEW_MESSAGE notification', { err, conversationId }));

    // Gap #10: fire-and-forget, see activityService.record()'s own doc
    // comment. Every message the caller sends adds a timeline row —
    // acceptable volume (bounded by how many messages one user actually
    // sends, same order of magnitude as their own Message rows already
    // in the DB), unlike AnalyticsEvent's anonymous-traffic volume.
    activityService.record({ userId, ...activityTemplates.messageSent(conversationId, recipient.name) });

    return message;
  },

  /**
   * Soft-deletes a message — only the sender may delete their own
   * message (not the other party, and not based on conversation
   * membership alone, which is why this checks message.senderId rather
   * than reusing assertParty). Idempotent on an already-deleted message:
   * calling this twice just returns the same already-redacted result
   * rather than erroring, since the end state either way is "deleted".
   */
  deleteMessage: async (userId: string, conversationId: string, messageId: string): Promise<Message> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);

    const message = await messagesRepository.findById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND');
    }
    if (message.senderId !== userId) {
      throw new ForbiddenError('You can only delete your own messages.', 'NOT_YOUR_MESSAGE');
    }

    if (message.deletedAt) return redactIfDeleted(message);

    const deleted = await messagesRepository.softDelete(messageId);
    return redactIfDeleted(deleted);
  },

  /**
   * Fetches a page of messages and marks the caller's unread inbound
   * messages as read in the same call — matches how a real chat UI
   * actually behaves (opening/polling a thread you're a party to is
   * itself the read receipt), rather than requiring a separate
   * mark-as-read round trip the frontend would have to remember to fire.
   */
  getMessages: async (
    userId: string,
    conversationId: string,
    query: { page?: number; limit?: number }
  ): Promise<PaginatedResult<Message>> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);

    const [{ messages, total }] = await Promise.all([
      messagesRepository.findManyByConversationId(conversationId, query),
      messagesRepository.markReadForRecipient(conversationId, userId),
    ]);

    return {
      items: messages.map(redactIfDeleted),
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 30),
    };
  },
};
