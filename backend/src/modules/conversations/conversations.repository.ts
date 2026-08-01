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
    adId: string | null,
    buyerId: string,
    sellerId: string
  ): Promise<Conversation | null> =>
    prisma.conversation.findUnique({
      where: { adId_buyerId_sellerId: { adId: adId as string, buyerId, sellerId } },
    }),

  create: (adId: string | null, buyerId: string, sellerId: string): Promise<Conversation> =>
    prisma.conversation.create({ data: { adId, buyerId, sellerId } }),

  findById: (id: string): Promise<ConversationWithRelations | null> =>
    prisma.conversation.findUnique({ where: { id }, include: conversationWithRelations }),

  /** Every conversation the caller is a party to, as either buyer or
   * seller, most-recently-active first (updatedAt bumps on every new
   * message — see touchUpdatedAt). */
  findManyForUser: async (
    userId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ conversations: ConversationWithRelations[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ConversationWhereInput = {
      OR: [{ buyerId: userId }, { sellerId: userId }],
    };

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: conversationWithRelations,
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      prisma.conversation.count({ where }),
    ]);
    return { conversations, total };
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
      // view (see useMessages's own doc comment for why).
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
