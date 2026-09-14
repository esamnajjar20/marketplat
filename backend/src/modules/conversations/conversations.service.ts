import { Conversation, Message } from '@prisma/client';
import { conversationsRepository, messagesRepository, ConversationWithRelations, ConversationListItem } from './conversations.repository';
import { adsRepository } from '../ads/ads.repository';
import { usersRepository } from '../users/users.repository';
import { serviceRequestsRepository } from '../service-requests/service-requests.repository';
import { notificationEvents, notificationsService } from '../notifications';
import { publishNotificationEvent } from '../../shared/utils/notificationStream';
import { blockedUsersService } from '../blocked-users';
import { activityService, activityTemplates } from '../activity';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { logger } from '../../shared/utils/logger';
import { sellerResponseTimeService } from '../sellers/seller-response-time.service';

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
  message.deletedAt
    ? { ...message, body: '', imageUrl: null }
    : message;

// FIX MSG-SCAN-01: same high-signal scam phrasing the ad fraud scorer
// uses — applied here so steering payment off-platform in chat can't
// bypass the ad-side check. Phone numbers are NOT rejected: arranging
// a meetup is legitimate marketplace use. URLs alone are also allowed;
// only the explicit scam phrases below are hard-blocked.
const MESSAGE_SCAM_PATTERNS: RegExp[] = [
  /wire\s*transfer\s*only/i,
  /western\s*union/i,
  /gift\s*card/i,
  // Word-bounded: avoid matching unrelated "send … deposit … first" spans
  /\bsend\s+(?:a\s+)?deposit\s+first\b/i,
  /حوالة\s*بنكية\s*فقط/,
  /ادفع\s+مقدم(?:اً|ا)?\s+قبل/,
  /تحويل\s*غربي/,
  /بطاقة\s*هدية/,
];

const assertMessageBodySafe = (body: string): void => {
  if (MESSAGE_SCAM_PATTERNS.some((p) => p.test(body))) {
    throw new BadRequestError(
      'Message blocked: content matches known scam patterns. Keep negotiation on-platform.',
      'MESSAGE_CONTENT_BLOCKED'
    );
  }
};

export const conversationsService = {
  /**
   * Starts (or reopens) a thread about a specific ad. The only entry
   * point in the current UI (SellerCard's "مراسلة البائع") always
   * supplies an adId — this resolves the ad's owner as the seller side
   * and the caller as the buyer side, then reuses the existing thread
   * for this (buyer, seller) *pair* if one already exists — regardless
   * of which ad (this one or any other) it originally started from —
   * rather than creating a duplicate. adId is only ever recorded on a
   * conversation created fresh by this call; reopening an existing
   * thread never overwrites its stored context. Same idempotent-create
   * shape as sellers.service's own profile-creation guard.
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

    return conversationsRepository.findOrCreate(buyerId, sellerId, { adId });
  },

  /**
   * Starts (or reopens) a thread directly with a user, with no ad in
   * context — PublicProfileHeader's "مراسلة" button, for a visitor who
   * wants to reach someone without going through one of their listings
   * first. Mirrors startFromAd's guard order (self-message, then block
   * check, then idempotent reuse) but resolves the target user instead
   * of an ad. findOrCreate's pair lookup checks both directions, so
   * this also reopens a thread that started the other way around (the
   * target previously messaged buyerId's ad or profile first).
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

    return conversationsRepository.findOrCreate(buyerId, sellerId);
  },

  /**
   * Starts (or reopens) a thread about a specific service request — the
   * request detail page's "تواصل" entry point. Unlike startFromAd
   * (always buyer-initiated toward the ad owner), either the customer
   * or the provider on the request may call this first; whichever one
   * isn't the caller becomes the other party.
   *
   * FEAT-CONV-DEDUP: this now goes through the same pair-based
   * findOrCreate as every other entry point — if the customer and
   * provider already have a conversation (started via an ad, a direct
   * profile message, or a different service request between the same
   * two people), that thread is reused and serviceRequestId is left as
   * whatever it already was, not overwritten to point at this request.
   * serviceRequestId is still recorded as this conversation's context
   * on the branch that actually creates a fresh row — the request's
   * own @unique constraint on that column only matters at that point
   * (findOrCreate's pair lookup already covers "does a thread for this
   * specific request already exist", since a request has exactly one
   * customer and one provider).
   */
  startFromServiceRequest: async (userId: string, serviceRequestId: string): Promise<Conversation> => {
    const request = await serviceRequestsRepository.findById(serviceRequestId);
    if (!request) throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');

    const providerUserId = request.listing.provider.sellerProfile.userId;
    const customerId = request.customerId;

    if (userId !== customerId && userId !== providerUserId) {
      throw new ForbiddenError('You are not a party to this service request.', 'NOT_YOUR_SERVICE_REQUEST');
    }

    // A provider can't message themselves about their own request (the
    // self-request case service-requests.service.ts already blocks at
    // creation — see its own "also blocks fake completedRequestsCount"
    // comment) — this is defense in depth, not the primary guard.
    if (customerId === providerUserId) {
      throw new BadRequestError('You cannot message yourself.', 'CANNOT_MESSAGE_SELF');
    }

    if (await blockedUsersService.isBlockedEitherDirection(customerId, providerUserId)) {
      throw new ForbiddenError('You cannot message this user.', 'USER_BLOCKED');
    }

    return conversationsRepository.findOrCreate(customerId, providerUserId, { serviceRequestId });
  },

  getConversationById: async (userId: string, id: string): Promise<ConversationWithRelations> => {
    const conversation = await conversationsRepository.findById(id);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    return conversation;
  },

  getMyConversations: async (
    userId: string,
    query: {
      page?: number;
      limit?: number;
      includeArchived?: boolean;
      archivedOnly?: boolean;
    }
  ): Promise<PaginatedResult<ConversationListItem>> => {
    const { conversations, total } = await conversationsRepository.findManyForUser(userId, query);
    return {
      items: conversations,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  sendMessage: async (
    userId: string,
    conversationId: string,
    input: { body?: string; imageUrl?: string }
  ): Promise<Message> => {
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

    const body = (input.body ?? '').trim();
    const imageUrl = input.imageUrl?.trim() || null;
    if (!body && !imageUrl) {
      throw new BadRequestError('Message cannot be empty', 'MESSAGE_EMPTY');
    }
    if (body) assertMessageBodySafe(body);

    const [message] = await Promise.all([
      messagesRepository.create(conversationId, userId, body || (imageUrl ? '📷' : ''), imageUrl),
      conversationsRepository.touchUpdatedAt(conversationId),
    ]);

    // Fire-and-forget per notificationEvents' own contract: a
    // notification failing to write must never fail message sending,
    // which has already succeeded above. Notify whichever party is NOT
    // the sender.
    const recipient = conversation.buyerId === userId ? conversation.seller : conversation.buyer;
    const sender = conversation.buyerId === userId ? conversation.buyer : conversation.seller;
    // Live chat: push the saved message to both parties' SSE streams
    // (sender's other devices + recipient). Offline users catch up via REST.
    const messagePayload = {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      body: message.body,
      imageUrl: (message as { imageUrl?: string | null }).imageUrl ?? null,
      readAt: message.readAt ? message.readAt.toISOString() : null,
      deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
      createdAt: message.createdAt.toISOString(),
    };
    void publishNotificationEvent(recipient.id, {
      type: 'message:new',
      conversationId,
      message: messagePayload,
    });
    void publishNotificationEvent(userId, {
      type: 'message:new',
      conversationId,
      message: messagePayload,
    });

    notificationEvents
      .onNewMessage(recipient.id, conversationId, sender.name)
      .catch((err) => logger.error('Failed to create NEW_MESSAGE notification', { err, conversationId }));

    // Gap #10: fire-and-forget, see activityService.record()'s own doc
    // comment. Every message the caller sends adds a timeline row —
    // acceptable volume (bounded by how many messages one user actually
    // sends, same order of magnitude as their own Message rows already
    // in the DB), unlike AnalyticsEvent's anonymous-traffic volume.
    activityService.record({ userId, ...activityTemplates.messageSent(conversationId, recipient.name) });

    // TRACK-RESPONSE-TIME: first seller reply updates EMA on SellerProfile
    void sellerResponseTimeService.recordSellerFirstReply(
      conversationId,
      userId,
      conversation.sellerId,
      message.createdAt
    );

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
    const deletedIso = deleted.deletedAt
      ? deleted.deletedAt.toISOString()
      : new Date().toISOString();
    const buyerId = conversation.buyerId;
    const sellerId = conversation.sellerId;
    void publishNotificationEvent(buyerId, {
      type: 'message:deleted',
      conversationId,
      messageId,
      deletedAt: deletedIso,
    });
    void publishNotificationEvent(sellerId, {
      type: 'message:deleted',
      conversationId,
      messageId,
      deletedAt: deletedIso,
    });
    return redactIfDeleted(deleted);
  },

  /** Aggregate unread thread count for the nav messages badge. */
  getUnreadCount: async (userId: string): Promise<{ count: number }> => {
    const count = await messagesRepository.countUnreadConversationsForUser(userId);
    return { count };
  },

  /**
   * Fetches a page of messages and marks the caller's unread inbound
   * messages as read in the same call — matches how a real chat UI
   * actually behaves (opening/polling a thread you're a party to is
   * itself the read receipt), rather than requiring a separate
   * mark-as-read round trip the frontend would have to remember to fire.
   */
  setConversationFlags: async (
    userId: string,
    conversationId: string,
    flags: { pinned?: boolean; archived?: boolean }
  ): Promise<Conversation> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    const data: { pinnedAt?: Date | null; archivedAt?: Date | null } = {};
    if (flags.pinned !== undefined) data.pinnedAt = flags.pinned ? new Date() : null;
    if (flags.archived !== undefined) data.archivedAt = flags.archived ? new Date() : null;
    return conversationsRepository.setFlags(conversationId, data);
  },

  /** Ephemeral typing signal — no DB write; SSE only. */
  signalTyping: async (
    userId: string,
    conversationId: string,
    isTyping: boolean
  ): Promise<void> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    const otherId =
      conversation.buyerId === userId ? conversation.sellerId : conversation.buyerId;
    void publishNotificationEvent(otherId, {
      type: 'typing',
      conversationId,
      userId,
      isTyping,
    });
  },

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

    // Sync bell: mark NEW_MESSAGE notifications for this conversation read.
    void notificationsService
      .markConversationNotificationsRead(userId, conversationId)
      .catch(() => {});

    return {
      items: messages.map(redactIfDeleted),
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 30),
    };
  },
};
