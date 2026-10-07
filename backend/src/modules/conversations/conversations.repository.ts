import { prisma } from '../../config/prisma';
import { Prisma, Conversation, Message } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { isPrismaError } from '../../shared/utils/prismaErrors';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { decodeMessageCursor, encodeMessageCursor } from '../../shared/utils/messageCursor';

export type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: {
    ad: { select: { id: true; title: true; images: true; status: true } };
    serviceRequest: { select: { id: true; details: true; status: true; listing: { select: { id: true; title: true; images: true } } } };
    buyer: { select: { id: true; name: true; avatarUrl: true } };
    seller: { select: { id: true; name: true; avatarUrl: true } };
  };
}>;

/**
 * findManyForUser's own result type — ConversationWithRelations
 * plus a per-conversation unreadCount. Kept separate from
 * ConversationWithRelations itself (rather than adding _count there)
 * since findById/getConversationById (single-thread view) has no use
 * for it — that page already marks messages read via getMessages, and
 * a badge on a thread the caller is currently looking at doesn't mean
 * anything.
 */
/**
 * list rows carry the newest message for inbox preview.
 * Soft-deleted messages stay (body redacted in the service layer).
 */
export type ConversationListItem = ConversationWithRelations & {
  unreadCount: number;
  lastMessage: Message | null;
  mySettings: { pinnedAt: Date | null; archivedAt: Date | null; deletedAt: Date | null; mutedUntil: Date | null } | null;
};

const conversationWithRelations = {
  // Epic 5: ad is nullable on the row itself (adId String?) — the
  // include still always resolves buyer/seller since those FKs are
  // required, but `ad` on the returned object will be null once the
  // linked Ad is deleted (onDelete: SetNull) or for a conversation that
  // was never ad-linked in the first place.
  ad: { select: { id: true, title: true, images: true, status: true } },
  // CHAT-LINK: same nullable-context idea as `ad` above, for a
  // conversation started from a ServiceRequest instead. Includes the
  // listing's own title/images one level down so the thread UI can
  // show "بخصوص: تصليح لابتوب" the same way it already shows an ad's
  // thumbnail, without a second round trip.
  serviceRequest: {
    select: {
      id: true,
      details: true,
      status: true,
      listing: { select: { id: true, title: true, images: true } },
    },
  },
  buyer: { select: { id: true, name: true, avatarUrl: true } },
  seller: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export const conversationsRepository = {
  /**
   * FEAT-CONV-DEDUP: the conversation's identity is the (buyerId,
   * sellerId) *pair* of users — not which of the two is stored in
   * which column. A thread A opens by messaging B's ad (buyerId: A,
   * sellerId: B) must be the same thread B later reopens by messaging
   * A's ad (buyerId: B, sellerId: A) or A's profile directly. The DB's
   * own @@unique([buyerId, sellerId]) only dedupes one exact ordering
   * (see that index's schema comment), so every lookup here checks
   * both orderings — whichever one exists, if any, is the canonical
   * conversation for this pair. Always a findFirst, never findUnique:
   * even though at most one row can match, Postgres has no single
   * index that covers "either ordering" as one unique key.
   */
  findByUserPair: (userAId: string, userBId: string): Promise<Conversation | null> =>
    prisma.conversation.findFirst({
      where: {
        OR: [
          { buyerId: userAId, sellerId: userBId },
          { buyerId: userBId, sellerId: userAId },
        ],
      },
    }),

  /** Raw insert — no dedup, no race handling. Use findOrCreate for the
   * idempotent start-a-conversation flow; this stays a thin primitive
   * mainly so tests can assert the exact row shape being written. */
  create: async (
    buyerId: string,
    sellerId: string,
    context: { adId?: string | null; serviceRequestId?: string | null; listingContext?: Prisma.InputJsonValue | null } = {}
  ): Promise<Conversation> => prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        buyerId,
        sellerId,
        adId: context.adId ?? null,
        serviceRequestId: context.serviceRequestId ?? null,
        context: context.listingContext ?? undefined,
      },
    });
    await tx.conversationUserSetting.createMany({
      data: [
        { conversationId: conversation.id, userId: buyerId },
        { conversationId: conversation.id, userId: sellerId },
      ],
    });
    return conversation;
  }),

  /** Ensures both participants have a private settings row. */
  ensureUserSettings: async (conversationId: string, userIds: string[]): Promise<void> => {
    await prisma.conversationUserSetting.createMany({
      data: [...new Set(userIds)].map((userId) => ({ conversationId, userId })),
      skipDuplicates: true,
    });
  },

  /**
   * Idempotent start-a-conversation: reuse the existing thread for this
   * pair of users if one exists (either direction — see
   * findByUserPair), otherwise create one. Concurrent callers can both
   * pass the initial lookup and race into create() — the DB's
   * @@unique([buyerId, sellerId]) then rejects whichever insert loses
   * the race with P2002, which is caught here and turned into a
   * refetch-and-return-existing instead of a user-facing error. Same
   * idempotent-create shape already used elsewhere in this codebase
   * (see blocked-users.service.ts's toggleBlock).
   *
   * context (adId / serviceRequestId) is only ever applied on the
   * branch that actually creates a new row — reusing an existing
   * conversation never mutates its stored context to match whatever
   * ad/request this particular call happened to come from, matching
   * adId's existing "initial context only" contract.
   */
  findOrCreate: async (
    buyerId: string,
    sellerId: string,
    context: { adId?: string | null; serviceRequestId?: string | null; listingContext?: Prisma.InputJsonValue | null } = {}
  ): Promise<Conversation> => {
    // Lookup is direction-agnostic so A→B and B→A resolve to the same
    // thread. Insert keeps SEMANTIC roles: buyerId = initiator / customer,
    // sellerId = listing owner / provider. Do NOT alphabetize — metrics
    // jobs (updateSellerResponseMetrics) and trust UI depend on those
    // meanings. Same-order races are covered by @@unique + P2002; reverse-
    // order concurrent inserts remain rare and are cleaned by the merge
    // migration. A future LEAST/GREATEST unique index can harden this
    // without rewriting column semantics.
    const existing = await conversationsRepository.findByUserPair(buyerId, sellerId);
    if (existing) {
      await conversationsRepository.ensureUserSettings(existing.id, [buyerId, sellerId]);
      return existing;
    }

    try {
      return await conversationsRepository.create(buyerId, sellerId, context);
    } catch (err) {
      if (!isPrismaError(err, 'P2002')) throw err;
      const winner = await conversationsRepository.findByUserPair(buyerId, sellerId);
      if (winner) {
        await conversationsRepository.ensureUserSettings(winner.id, [buyerId, sellerId]);
        return winner;
      }
      throw err;
    }
  },

  findById: (id: string): Promise<ConversationWithRelations | null> =>
    prisma.conversation.findUnique({ where: { id }, include: conversationWithRelations }),

  findByIdForUser: async (id: string, userId: string): Promise<(ConversationWithRelations & { mySettings: { pinnedAt: Date | null; archivedAt: Date | null; deletedAt: Date | null; mutedUntil: Date | null } | null }) | null> => {
    const conversation = await prisma.conversation.findUnique({ where: { id }, include: conversationWithRelations });
    if (!conversation) return null;
    const setting = await prisma.conversationUserSetting.findUnique({ where: { conversationId_userId: { conversationId: id, userId } }, select: { pinnedAt: true, archivedAt: true, deletedAt: true, mutedUntil: true } });
    return { ...conversation, mySettings: setting };
  },

  /** Every conversation the caller is a party to, as either buyer or
   * seller, most-recently-active first (updatedAt bumps on every new
   * message — see touchUpdatedAt).
   *
   * now also returns unreadCount per conversation — was
   * previously only available in aggregate across every conversation
   * via countUnreadConversationsForUser, with nothing telling the
   * frontend WHICH thread(s) in the list actually have unread
   * messages. _count with a nested `where` (rather than a separate
   * query per conversation) runs as one correlated subquery per row
   * inside the single findMany call — not an N+1 round trip — same
   * shape Prisma already generates for any relation count. */
  findManyForUser: async (
    userId: string,
    query: {
      page?: number;
      limit?: number;
      // the endpoint accepted these two flags
      // since setConversationFlags shipped (validation parsed them,
      // service forwarded them), but this function's signature narrowed
      // query to { page, limit } and the WHERE clause never touched
      // archivedAt. Net effect: archiving a conversation appeared to
      // work (the row was updated), but the thread stayed in the list
      // forever because no filter ever read the column. Now honored:
      //   - includeArchived: true  → include archived alongside active
      //   - archivedOnly: true     → only archived
      //   - default (neither)      → only non-archived
      // If both are passed, archivedOnly wins (strictest). Neither
      // filter touches the existing OR on buyerId/sellerId.
      includeArchived?: boolean;
      archivedOnly?: boolean;
      role?: 'buying' | 'selling';
    }
  ): Promise<{ conversations: ConversationListItem[]; total: number }> => {
    const { page = 1, limit = 20, includeArchived, archivedOnly, role } = query;
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.ConversationWhereInput = {
      ...(role === 'buying' ? { buyerId: userId } : role === 'selling' ? { sellerId: userId } : { OR: [{ buyerId: userId }, { sellerId: userId }] }),
      userSettings: { some: { userId, ...(archivedOnly ? { archivedAt: { not: null } } : includeArchived ? {} : { archivedAt: null }), deletedAt: null } },
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          ...conversationWithRelations,
          // soft-deleted messages must not keep a badge alive
          // after the sender retracted them before the recipient opened
          // the thread.
          _count: {
            select: {
              messages: {
                where: { senderId: { not: userId }, readAt: null, deletedAt: null },
              },
            },
          },
          // newest message for inbox preview (1 row, not N+1).
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          userSettings: { where: { userId }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      prisma.conversation.count({ where }),
    ]);

    return {
      conversations: conversations.map(({ _count, messages, userSettings, ...conversation }) => {
        const settings = userSettings?.[0];
        return {
          ...conversation,
          unreadCount: _count.messages,
          lastMessage: messages[0] ?? null,
          mySettings: settings
            ? {
                pinnedAt: settings.pinnedAt,
                archivedAt: settings.archivedAt,
                deletedAt: settings.deletedAt,
                mutedUntil: settings.mutedUntil,
              }
            : null,
        };
      }),
      total,
    };
  },

  /** Bumps updatedAt so the thread resorts to the top of the caller's
   * list — called alongside every new message, same "touch the parent
   * row" idea as ServiceRequest.respondedAt on a status transition. */
  touchUpdatedAt: (id: string): Promise<Conversation> =>
    prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } }),

  getUserSetting: (conversationId: string, userId: string) =>
    prisma.conversationUserSetting.findUnique({ where: { conversationId_userId: { conversationId, userId } } }),

  upsertUserSetting: (
    conversationId: string,
    userId: string,
    data: { pinnedAt?: Date | null; archivedAt?: Date | null; deletedAt?: Date | null; mutedUntil?: Date | null }
  ) =>
    prisma.conversationUserSetting.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, ...data },
      update: data,
    }),

  deleteUserSetting: (conversationId: string, userId: string) =>
    prisma.conversationUserSetting.deleteMany({ where: { conversationId, userId } }),

  isMuted: async (conversationId: string, userId: string): Promise<boolean> => {
    const setting = await prisma.conversationUserSetting.findUnique({ where: { conversationId_userId: { conversationId, userId } }, select: { mutedUntil: true } });
    return Boolean(setting?.mutedUntil && setting.mutedUntil > new Date());
  },

};

export const messagesRepository = {
  create: (
    conversationId: string,
    senderId: string,
    body: string,
    imageUrl?: string | null,
    audioUrl?: string | null,
    file?: { url: string; name: string; mimeType: string; size: number } | null,
    clientOperationId?: string | null,
  ): Promise<Message> =>
    prisma.message.create({
      data: { conversationId, senderId, body, imageUrl: imageUrl ?? null, audioUrl: audioUrl ?? null, fileUrl: file?.url ?? null, fileName: file?.name ?? null, fileMimeType: file?.mimeType ?? null, fileSize: file?.size ?? null, clientOperationId: clientOperationId ?? null },
    }),

  findBySenderAndOperationId: (senderId: string, clientOperationId: string): Promise<Message | null> =>
    prisma.message.findUnique({
      where: { senderId_clientOperationId: { senderId, clientOperationId } },
    }),

  findById: (id: string): Promise<Message | null> =>
    prisma.message.findUnique({ where: { id } }),

  /** Soft-delete: sets deletedAt, leaves `body` and every other column
   * untouched. Caller (messagesService.deleteMessage) has already
   * verified the requester is the sender before this is called. */
  softDelete: (id: string): Promise<Message> =>
    prisma.message.update({ where: { id }, data: { deletedAt: new Date() } }),

  findMediaByConversationId: (
    conversationId: string,
    limit = 100,
  ): Promise<Message[]> =>
    prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        OR: [{ imageUrl: { not: null } }, { audioUrl: { not: null } }, { fileUrl: { not: null } }],
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    }),

  pinMessage: (messageId: string, pinnedById: string): Promise<void> =>
    prisma.messagePin.upsert({
      where: { messageId },
      create: { messageId, pinnedById },
      update: { pinnedById, createdAt: new Date() },
    }).then(() => undefined),

  unpinMessage: (messageId: string): Promise<void> =>
    prisma.messagePin.deleteMany({ where: { messageId } }).then(() => undefined),

  starMessage: (messageId: string, userId: string): Promise<void> =>
    prisma.messageStar.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: {},
    }).then(() => undefined),

  unstarMessage: (messageId: string, userId: string): Promise<void> =>
    prisma.messageStar.deleteMany({ where: { messageId, userId } }).then(() => undefined),

  findManyByConversationId: async (
    conversationId: string,
    query: { page?: number; limit?: number; before?: string },
    viewerId?: string,
  ): Promise<{ messages: Message[]; total: number; nextCursor: string | null }> => {
    const limit = Math.min(Math.max(query.limit ?? 30, 1), 100);
    const cursor = query.before ? decodeMessageCursor(query.before) : null;
    const where: Prisma.MessageWhereInput = { conversationId };

    if (query.before && !cursor) {
      throw new BadRequestError('Invalid message cursor', 'INVALID_MESSAGE_CURSOR');
    }
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ];
    }

    const [rows, total] = await Promise.all([
      prisma.message.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: {
          pin: true,
          ...(viewerId ? { stars: { where: { userId: viewerId }, select: { userId: true } } } : {}),
        },
      }),
      prisma.message.count({ where: { conversationId } }),
    ]);

    const hasMore = rows.length > limit;
    const messages = hasMore ? rows.slice(0, limit) : rows;
    const last = messages[messages.length - 1];
    return {
      messages,
      total,
      nextCursor: hasMore && last ? encodeMessageCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  },

  /** Marks every unread message in the thread not sent by the caller as
   * read — used when the caller opens/polls a conversation they're a
   * party to. Returns the count actually updated (0 is a normal,
   * expected outcome: nothing unread, or caller has no unread messages
   * from the other party). */
  markReadForRecipient: (conversationId: string, recipientId: string): Promise<Prisma.BatchPayload> =>
    prisma.message.updateMany({
      where: { conversationId, senderId: { not: recipientId }, readAt: null },
      data: { readAt: new Date() },
    }),

  /** Count of conversations with at least one unread (non-deleted)
   * inbound message — powers the nav badge via GET /conversations/unread-count. */
  countUnreadConversationsForUser: (userId: string): Promise<number> =>
    prisma.conversation.count({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
        messages: {
          some: { senderId: { not: userId }, readAt: null, deletedAt: null },
        },
      },
    }),
};
