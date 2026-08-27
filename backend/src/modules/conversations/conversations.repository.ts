import { prisma } from '../../config/prisma';
import { Prisma, Conversation, Message } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: {
    ad: { select: { id: true; title: true; images: true; status: true } };
    serviceRequest: { select: { id: true; details: true; status: true; listing: { select: { id: true; title: true; images: true } } } };
    buyer: { select: { id: true; name: true; avatarUrl: true } };
    seller: { select: { id: true; name: true; avatarUrl: true } };
  };
}>;

/**
 * FIX UX-15: findManyForUser's own result type — ConversationWithRelations
 * plus a per-conversation unreadCount. Kept separate from
 * ConversationWithRelations itself (rather than adding _count there)
 * since findById/getConversationById (single-thread view) has no use
 * for it — that page already marks messages read via getMessages, and
 * a badge on a thread the caller is currently looking at doesn't mean
 * anything.
 */
export type ConversationListItem = ConversationWithRelations & { unreadCount: number };

const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

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
  create: (
    buyerId: string,
    sellerId: string,
    context: { adId?: string | null; serviceRequestId?: string | null } = {}
  ): Promise<Conversation> =>
    prisma.conversation.create({
      data: {
        buyerId,
        sellerId,
        adId: context.adId ?? null,
        serviceRequestId: context.serviceRequestId ?? null,
      },
    }),

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
    context: { adId?: string | null; serviceRequestId?: string | null } = {}
  ): Promise<Conversation> => {
    const existing = await conversationsRepository.findByUserPair(buyerId, sellerId);
    if (existing) return existing;

    try {
      return await conversationsRepository.create(buyerId, sellerId, context);
    } catch (err) {
      if (!isPrismaError(err, 'P2002')) throw err;
      const winner = await conversationsRepository.findByUserPair(buyerId, sellerId);
      if (winner) return winner;
      throw err;
    }
  },

  findById: (id: string): Promise<ConversationWithRelations | null> =>
    prisma.conversation.findUnique({ where: { id }, include: conversationWithRelations }),

  /** Every conversation the caller is a party to, as either buyer or
   * seller, most-recently-active first (updatedAt bumps on every new
   * message — see touchUpdatedAt).
   *
   * FIX UX-15: now also returns unreadCount per conversation — was
   * previously only available in aggregate across every conversation
   * via countUnreadConversationsForUser, with nothing telling the
   * frontend WHICH thread(s) in the list actually have unread
   * messages. _count with a nested `where` (rather than a separate
   * query per conversation) runs as one correlated subquery per row
   * inside the single findMany call — not an N+1 round trip — same
   * shape Prisma already generates for any relation count. */
  findManyForUser: async (
    userId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ conversations: ConversationListItem[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ConversationWhereInput = {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          ...conversationWithRelations,
          _count: {
            select: {
              messages: { where: { senderId: { not: userId }, readAt: null } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      prisma.conversation.count({ where }),
    ]);

    return {
      conversations: conversations.map(({ _count, ...conversation }) => ({
        ...conversation,
        unreadCount: _count.messages,
      })),
      total,
    };
  },

  /** Bumps updatedAt so the thread resorts to the top of the caller's
   * list — called alongside every new message, same "touch the parent
   * row" idea as ServiceRequest.respondedAt on a status transition. */
  touchUpdatedAt: (id: string): Promise<Conversation> =>
    prisma.conversation.update({ where: { id }, data: { updatedAt: new Date() } }),
};

export const messagesRepository = {
  create: (conversationId: string, senderId: string, body: string): Promise<Message> =>
    prisma.message.create({ data: { conversationId, senderId, body } }),

  findById: (id: string): Promise<Message | null> =>
    prisma.message.findUnique({ where: { id } }),

  /** Soft-delete: sets deletedAt, leaves `body` and every other column
   * untouched. Caller (messagesService.deleteMessage) has already
   * verified the requester is the sender before this is called. */
  softDelete: (id: string): Promise<Message> =>
    prisma.message.update({ where: { id }, data: { deletedAt: new Date() } }),

  findManyByConversationId: async (
    conversationId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ messages: Message[]; total: number }> => {
    const { page = 1, limit = 30 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.MessageWhereInput = { conversationId };

    const [messages, total] = await Promise.all([
      // Newest-first at the DB level (cheap for pagination), same as
      // every other list endpoint in this codebase — the frontend
      // reverses this into chronological order for the actual thread
      // view (see useMessages's own doc comment for why). Soft-deleted
      // rows are still included (not filtered out) — the thread must
      // keep the placeholder in its correct chronological slot; only
      // `body` is stripped, in the service layer just before the
      // response is built.
      prisma.message.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.message.count({ where }),
    ]);
    return { messages, total };
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

  /** Count of conversations with at least one unread message addressed
   * to the caller — powers a future unread-badge; not otherwise used by
   * this module's own endpoints yet. */
  countUnreadConversationsForUser: (userId: string): Promise<number> =>
    prisma.conversation.count({
      where: {
        OR: [{ buyerId: userId }, { sellerId: userId }],
        messages: { some: { senderId: { not: userId }, readAt: null } },
      },
    }),
};
