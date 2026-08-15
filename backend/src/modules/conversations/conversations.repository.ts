import { prisma } from '../../config/prisma';
import { Prisma, Conversation, Message } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export type ConversationWithRelations = Prisma.ConversationGetPayload<{
  include: {
    ad: { select: { id: true; title: true; images: true; status: true } };
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

const conversationWithRelations = {
  // Epic 5: ad is nullable on the row itself (adId String?) — the
  // include still always resolves buyer/seller since those FKs are
  // required, but `ad` on the returned object will be null once the
  // linked Ad is deleted (onDelete: SetNull) or for a conversation that
  // was never ad-linked in the first place.
  ad: { select: { id: true, title: true, images: true, status: true } },
  buyer: { select: { id: true, name: true, avatarUrl: true } },
  seller: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export const conversationsRepository = {
  /** Looks up the single existing thread for a given (ad, buyer, seller)
   * triple — mirrors the @@unique([adId, buyerId, sellerId]) constraint
   * exactly, so this is always a unique lookup, never a list. */
  findExisting: (
    adId: string,
    buyerId: string,
    sellerId: string
  ): Promise<Conversation | null> =>
    prisma.conversation.findUnique({
      where: { adId_buyerId_sellerId: { adId, buyerId, sellerId } },
    }),

  /**
   * Same idempotent-lookup idea as findExisting, but for the no-ad case
   * (userId-based start). Postgres treats NULL as distinct from itself
   * in a unique index, so @@unique([adId, buyerId, sellerId]) does NOT
   * dedupe rows where adId is null — findUnique can't be used here the
   * way findExisting uses it above. findFirst against (adId: null,
   * buyerId, sellerId) is the correct equivalent lookup for this case.
   */
  findExistingWithoutAd: (buyerId: string, sellerId: string): Promise<Conversation | null> =>
    prisma.conversation.findFirst({
      where: { adId: null, buyerId, sellerId },
    }),

  create: (adId: string | null, buyerId: string, sellerId: string): Promise<Conversation> =>
    prisma.conversation.create({ data: { adId, buyerId, sellerId } }),

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
