import { Conversation, Message } from '@prisma/client';
import { conversationsRepository, messagesRepository, ConversationWithRelations, ConversationListItem } from './conversations.repository';
import { adsRepository } from '../ads/ads.repository';
import { usersRepository } from '../users/users.repository';
import { serviceRequestsRepository } from '../service-requests/service-requests.repository';
import { productsRepository } from '../products/products.repository';
import { serviceListingsRepository } from '../service-listings/service-listings.repository';
import { notificationEvents, notificationsService } from '../notifications';
import { publishNotificationEvent } from '../../shared/utils/notificationStream';
import { blockedUsersService } from '../blocked-users';
import { activityService, activityTemplates } from '../activity';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { ServiceUnavailableError } from '../../shared/errors/ServiceUnavailableError';
import { ConflictError } from '../../shared/errors/ConflictError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { logger } from '../../shared/utils/logger';
import { cacheRedis } from '../../config/redis';
import { sellerResponseTimeService } from '../sellers/seller-response-time.service';
import { env } from '../../config/env';
import { isPrismaError } from '../../shared/utils/prismaErrors';

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
    ? { ...message, body: '', imageUrl: null, audioUrl: null }
    : message;

// same high-signal scam phrasing the ad fraud scorer
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

    return conversationsRepository.findOrCreate(buyerId, sellerId, {
      adId,
      listingContext: {
        type: 'ad',
        id: ad.id,
        title: ad.title,
        imageUrl: ad.images?.[0] ?? null,
        url: `/ads/${ad.id}`,
      },
    });
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
  startFromUser: async (buyerId: string, targetUserId: string, context?: { type: 'product' | 'service'; id: string }): Promise<Conversation> => {
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

    let listingContext: object | undefined;
    if (context?.type === 'product') {
      const product = await productsRepository.findPublicById(context.id);
      const ownerId = product?.store?.sellerProfile?.userId;
      if (!product || product.status !== 'ACTIVE' || ownerId !== sellerId) {
        throw new BadRequestError('Product context is invalid.', 'INVALID_MESSAGE_CONTEXT');
      }
      listingContext = { type: 'product', id: product.id, title: product.name, imageUrl: product.images?.[0] ?? null, url: `/products/${product.id}` };
    } else if (context?.type === 'service') {
      const listing = await serviceListingsRepository.findPublicById(context.id);
      const ownerId = listing?.provider?.sellerProfile?.userId;
      if (!listing || listing.status !== 'ACTIVE' || ownerId !== sellerId) {
        throw new BadRequestError('Service context is invalid.', 'INVALID_MESSAGE_CONTEXT');
      }
      listingContext = { type: 'service', id: listing.id, title: listing.title, imageUrl: listing.images?.[0] ?? null, url: `/services/${listing.id}` };
    }

    return conversationsRepository.findOrCreate(buyerId, sellerId, { listingContext });
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

    return conversationsRepository.findOrCreate(customerId, providerUserId, {
      serviceRequestId,
      listingContext: {
        type: 'service',
        id: request.listing.id,
        title: request.listing.title,
        imageUrl: request.listing.images?.[0] ?? null,
        url: `/services/${request.listing.id}`,
      },
    });
  },

  getConversationById: async (userId: string, id: string): Promise<ConversationWithRelations> => {
    const conversation = await conversationsRepository.findByIdForUser(id, userId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    if (conversation.mySettings?.deletedAt) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    return conversation;
  },

  getMyConversations: async (
    userId: string,
    query: {
      page?: number;
      limit?: number;
      includeArchived?: boolean;
      archivedOnly?: boolean;
      role?: 'buying' | 'selling';
    }
  ): Promise<PaginatedResult<ConversationListItem>> => {
    // explicit pass-through instead of
    // forwarding the whole query object. The previous shape relied on
    // structural typing — extra fields in `query` compiled fine while
    // the repository silently ignored them. Now every accepted filter
    // is named at the call site, so a future signature mismatch breaks
    // at compile time instead of at the user's expense.
    const { conversations, total } = await conversationsRepository.findManyForUser(userId, {
      page: query.page,
      limit: query.limit,
      includeArchived: query.includeArchived,
      archivedOnly: query.archivedOnly,
      role: query.role,
    });
    return {
      items: conversations,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  sendMessage: async (
    userId: string,
    conversationId: string,
    input: { body?: string; imageUrl?: string; audioUrl?: string; file?: { url: string; name: string; mimeType: string; size: number } },
    offlineOperationId?: string | null,
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
    const audioUrl = input.audioUrl?.trim() || null;
    const file = input.file ?? null;
    if (!body && !imageUrl && !audioUrl && !file) {
      throw new BadRequestError('Message cannot be empty', 'MESSAGE_EMPTY');
    }
    if (body) assertMessageBodySafe(body);

    // (atomic):
    // Schema has no offlineOperationId on Message (unlike ads). We use a
    // short-lived Redis claim so concurrent replays of the same
    // X-Offline-Op-Id cannot both CREATE. Window = 24h (offline queue
    // drain horizon) — not forever; document as idempotency window.
    //
    // State machine per key `msg:op:{userId}:{opId}`:
    //   SET NX "pending"  → this request owns creation
    //   value = messageId → prior success; return that row
    //   value = "pending" → peer in-flight; poll briefly for messageId
    //   create failure    → DEL so a retry can reclaim
    const MSG_OP_TTL_SEC = 86_400;
    const MSG_OP_PENDING = 'pending';
    const opId =
      typeof offlineOperationId === 'string' && offlineOperationId.trim()
        ? offlineOperationId.trim().slice(0, 128)
        : null;

    // PostgreSQL is the final idempotency boundary. Redis below is only a
    // fast concurrency guard; if Redis is unavailable or its 24h key is lost,
    // this durable key still prevents a second message row from being created.
    if (opId) {
      const existing = await messagesRepository.findBySenderAndOperationId(userId, opId);
      if (existing) {
        if (existing.conversationId !== conversationId) {
          throw new ConflictError('Offline operation id already used', 'OFFLINE_OP_ID_CONFLICT');
        }
        return existing;
      }
    }

    let claimedOpKey: string | null = null;

    if (opId) {
      const cacheKey = `msg:op:${userId}:${opId}`;
      try {
        // Atomic claim — only the first concurrent request proceeds to CREATE.
        const claimed = await cacheRedis.set(
          cacheKey,
          MSG_OP_PENDING,
          'EX',
          MSG_OP_TTL_SEC,
          'NX',
        );

        if (claimed !== 'OK') {
          // Peer holds the key (pending or final messageId).
          const sleep = (ms: number) =>
            new Promise<void>((r) => setTimeout(r, ms));

          // was 12 attempts (up to ~2.35s block on
          // a slow peer). 4 attempts cap the worst case at ~500ms — enough
          // for any in-flight INSERT on Neon to complete. If the peer is
          // truly hung, failing fast beats a network timeout on the client.
          for (let attempt = 0; attempt < 4; attempt++) {
            const existingVal = await cacheRedis.get(cacheKey);
            if (!existingVal) {
              // Key expired/deleted mid-flight — try reclaim once.
              const reclaimed = await cacheRedis.set(
                cacheKey,
                MSG_OP_PENDING,
                'EX',
                MSG_OP_TTL_SEC,
                'NX',
              );
              if (reclaimed === 'OK') {
                claimedOpKey = cacheKey;
                break;
              }
              continue;
            }
            if (existingVal !== MSG_OP_PENDING) {
              // constrain the replay to the same conversation
              // (findById is unconstrained by design elsewhere). Without
              // this, a stale opId from conversation X could return a
              // message belonging to conversation Y to the caller.
              const existing = await messagesRepository.findById(existingVal);
              if (existing && existing.conversationId === conversationId) {
                return existing;
              }
              // Stale id (row gone) — free the key and reclaim.
              await cacheRedis.del(cacheKey);
              const reclaimed = await cacheRedis.set(
                cacheKey,
                MSG_OP_PENDING,
                'EX',
                MSG_OP_TTL_SEC,
                'NX',
              );
              if (reclaimed === 'OK') {
                claimedOpKey = cacheKey;
                break;
              }
              continue;
            }
            // Still pending under peer — wait for final id.
            await sleep(50 + attempt * 25);
          }

          if (!claimedOpKey) {
            // Peer still creating after ~1s, or Redis flaky: last look.
            const finalVal = await cacheRedis.get(cacheKey);
            if (finalVal && finalVal !== MSG_OP_PENDING) {
              // same conversation constraint as above.
              const existing = await messagesRepository.findById(finalVal);
              if (existing && existing.conversationId === conversationId) return existing;
            }
            // Never create without the claim while another request still
            // owns this operation id. Doing so would defeat idempotency in
            // the exact slow-DB/concurrent-replay case the Redis claim is
            // meant to protect. A 503 lets the offline queue retry; the
            // next attempt will either observe the created message or
            // reclaim the key if the peer released it after a failed create.
            logger.warn('message offline-op peer still pending — deferring send', {
              userId,
              opId,
            });
            throw new ServiceUnavailableError(
              'Message operation is still being processed. Please retry shortly.',
              'OFFLINE_OPERATION_IN_FLIGHT',
            );
          }
        } else {
          claimedOpKey = cacheKey;
        }
      } catch (err) {
        // Redis down: do not block messaging. Idempotency degrades to
        // best-effort (same as pre-N2) rather than 500ing every send.
        logger.warn('message offline-op claim failed — proceeding to create', {
          err: err instanceof Error ? err.message : String(err),
        });
        claimedOpKey = null;
      }
    }

    // previously Promise.all of
    // create + touchUpdatedAt. If the touch failed (transient Redis/
    // DB blip) while create succeeded, Promise.all rejects — but the
    // message row is already committed. The client sees a 500 for a
    // message it actually sent, retries, and the user ends up with
    // two copies in the thread. touchUpdatedAt is pure bookkeeping
    // (last-activity timestamp on the conversation row); the message
    // is the thing that must not be lost. Split them: create first,
    // then touch is awaited but wrapped so a touch failure only logs
    // rather than masking the successful send.
    let message: Message;
    try {
      const messageBody = body || (imageUrl ? '📷' : audioUrl ? '🎤 رسالة صوتية' : file ? `📎 ${file.name}` : '');
      message = opId
        ? await messagesRepository.create(conversationId, userId, messageBody, imageUrl, audioUrl, file, opId)
        : await messagesRepository.create(conversationId, userId, messageBody, imageUrl, audioUrl, file);
    } catch (err) {
      // The composite unique index is the final race-proof boundary. If two
      // requests reached PostgreSQL together, the loser reuses the winner.
      if (opId && isPrismaError(err, 'P2002')) {
        const existing = await messagesRepository.findBySenderAndOperationId(userId, opId);
        if (existing) {
          if (existing.conversationId !== conversationId) {
            throw new ConflictError('Offline operation id already used', 'OFFLINE_OP_ID_CONFLICT');
          }
          if (claimedOpKey) {
            try { await cacheRedis.set(claimedOpKey, existing.id, 'EX', MSG_OP_TTL_SEC); } catch { /* ignore */ }
          }
          return existing;
        }
      }
      // Release claim so a client/queue retry can re-enter cleanly.
      if (claimedOpKey) {
        try {
          await cacheRedis.del(claimedOpKey);
        } catch {
          /* ignore */
        }
      }
      throw err;
    }

    if (claimedOpKey) {
      try {
        // Promote pending → concrete message id (same TTL window).
        await cacheRedis.set(claimedOpKey, message.id, 'EX', MSG_OP_TTL_SEC);
      } catch (err) {
        logger.warn('message offline-op finalize failed', {
          err: err instanceof Error ? err.message : String(err),
          messageId: message.id,
        });
      }
    } else if (opId) {
      // We created without holding a claim (Redis miss path) — still
      // best-effort record the id for later retries within the window.
      try {
        await cacheRedis.set(
          `msg:op:${userId}:${opId}`,
          message.id,
          'EX',
          MSG_OP_TTL_SEC,
        );
      } catch {
        /* ignore */
      }
    }

    // Best-effort: the conversation's updatedAt drives sorting in the
    // list view, so a lost touch means the thread briefly appears at
    // the wrong position — visibly minor, and the next message (or a
    // successful retry of this one's touch) corrects it. Never fails
    // the send.
    try {
      await conversationsRepository.touchUpdatedAt(conversationId);
    } catch (err) {
      logger.warn('Failed to touch conversation updatedAt after message send', {
        conversationId,
        messageId: message.id,
        err,
      });
    }

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
      audioUrl: (message as { audioUrl?: string | null }).audioUrl ?? null,
      fileUrl: (message as { fileUrl?: string | null }).fileUrl ?? null,
      fileName: (message as { fileName?: string | null }).fileName ?? null,
      fileMimeType: (message as { fileMimeType?: string | null }).fileMimeType ?? null,
      fileSize: (message as { fileSize?: number | null }).fileSize ?? null,
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
    flags: { pinned?: boolean; archived?: boolean; mutedUntil?: Date | null }
  ): Promise<Conversation> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    const data: { pinnedAt?: Date | null; archivedAt?: Date | null; mutedUntil?: Date | null } = {};
    if (flags.pinned !== undefined) data.pinnedAt = flags.pinned ? new Date() : null;
    if (flags.archived !== undefined) data.archivedAt = flags.archived ? new Date() : null;
    if (flags.mutedUntil !== undefined) data.mutedUntil = flags.mutedUntil;
    await conversationsRepository.upsertUserSetting(conversationId, userId, data);
    return conversation;
  },

  deleteConversationForUser: async (userId: string, conversationId: string): Promise<void> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    await conversationsRepository.upsertUserSetting(conversationId, userId, { deletedAt: new Date(), archivedAt: new Date(), pinnedAt: null });
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

  getMedia: async (userId: string, conversationId: string, limit = 100): Promise<Message[]> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    return messagesRepository.findMediaByConversationId(conversationId, limit);
  },

  getMediaAsset: async (
    userId: string,
    conversationId: string,
    messageId: string,
    kind: 'image' | 'audio' | 'file',
  ): Promise<{ url: string; mimeType: string; fileName: string | null; fileSize: number | null }> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);

    const message = await messagesRepository.findById(messageId);
    if (!message || message.conversationId !== conversationId || message.deletedAt) {
      throw new NotFoundError('Message media not found', 'MESSAGE_MEDIA_NOT_FOUND');
    }

    const url = kind === 'image' ? message.imageUrl : kind === 'audio' ? message.audioUrl : message.fileUrl;
    if (!url) throw new NotFoundError('Message media not found', 'MESSAGE_MEDIA_NOT_FOUND');
    try {
      const parsed = new URL(url);
      const cloudinaryHost = parsed.hostname === 'cloudinary.com' || parsed.hostname.endsWith('.cloudinary.com');
      const belongsToConfiguredCloud = parsed.pathname.includes(`/${env.cloudinary.cloudName}/`);
      if (parsed.protocol !== 'https:' || !cloudinaryHost || !belongsToConfiguredCloud) {
        throw new Error('Unsupported media provider');
      }
    } catch {
      throw new NotFoundError('Message media provider is not supported', 'MESSAGE_MEDIA_PROVIDER_UNSUPPORTED');
    }

    return {
      url,
      mimeType: kind === 'file' ? (message.fileMimeType || 'application/octet-stream') : kind === 'audio' ? 'audio/mpeg' : 'image/*',
      fileName: message.fileName ?? null,
      fileSize: message.fileSize ?? null,
    };
  },

  setMessagePin: async (userId: string, conversationId: string, messageId: string, pinned: boolean): Promise<void> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    const message = await messagesRepository.findById(messageId);
    if (!message || message.conversationId !== conversationId || message.deletedAt) {
      throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND');
    }
    if (pinned) await messagesRepository.pinMessage(messageId, userId);
    else await messagesRepository.unpinMessage(messageId);
  },

  setMessageStar: async (userId: string, conversationId: string, messageId: string, starred: boolean): Promise<void> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);
    const message = await messagesRepository.findById(messageId);
    if (!message || message.conversationId !== conversationId || message.deletedAt) {
      throw new NotFoundError('Message not found', 'MESSAGE_NOT_FOUND');
    }
    if (starred) await messagesRepository.starMessage(messageId, userId);
    else await messagesRepository.unstarMessage(messageId, userId);
  },

  getMessages: async (
    userId: string,
    conversationId: string,
    query: { page?: number; limit?: number; before?: string }
  ): Promise<PaginatedResult<Message> & { meta: PaginatedResult<Message>['meta'] & { nextCursor: string | null } }> => {
    const conversation = await conversationsRepository.findById(conversationId);
    if (!conversation) throw new NotFoundError('Conversation not found', 'CONVERSATION_NOT_FOUND');
    assertParty(conversation, userId);

    const [{ messages, total, nextCursor }] = await Promise.all([
      messagesRepository.findManyByConversationId(conversationId, query, userId),
      messagesRepository.markReadForRecipient(conversationId, userId),
    ]);

    // Sync bell: mark NEW_MESSAGE notifications for this conversation read.
    void notificationsService
      .markConversationNotificationsRead(userId, conversationId)
      .catch(() => {});

    return {
      items: messages.map((message) => ({
        ...redactIfDeleted(message),
        isPinned: Boolean((message as Message & { pin?: unknown }).pin),
        isStarredByMe: Array.isArray((message as Message & { stars?: unknown[] }).stars) && (message as Message & { stars?: unknown[] }).stars!.length > 0,
      })),
      meta: {
        ...buildPaginationMeta(total, query.page ?? 1, query.limit ?? 30),
        nextCursor: nextCursor ?? null,
        // Cursor pagination is authoritative for older-message traversal.
        hasNextPage: Boolean(nextCursor),
        hasPrevPage: Boolean(query.before),
      },
    };
  },
};
