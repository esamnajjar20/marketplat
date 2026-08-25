import { conversationsRepository, messagesRepository } from '../../src/modules/conversations/conversations.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    conversation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const conversationWithRelationsInclude = {
  ad: { select: { id: true, title: true, images: true, status: true } },
  buyer: { select: { id: true, name: true, avatarUrl: true } },
  seller: { select: { id: true, name: true, avatarUrl: true } },
  serviceRequest: {
    select: {
      id: true,
      details: true,
      status: true,
      listing: { select: { id: true, title: true, images: true } },
    },
  },
};

const buyerId = 'buyer-1';
const sellerId = 'seller-1';
const adId = 'ad-1';

describe('conversationsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findExisting', () => {
    it('queries by the (adId, buyerId, sellerId) compound unique key', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null);

      await conversationsRepository.findExisting(adId, buyerId, sellerId);

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { adId_buyerId_sellerId: { adId, buyerId, sellerId } },
      });
    });

  });

  // NOTE: findExisting no longer accepts a null adId. Postgres treats NULL
  // as distinct from itself inside a unique index, so
  // @@unique([adId, buyerId, sellerId]) does not dedupe adId: null rows —
  // findUnique against a null adId would silently never find a match,
  // breaking the idempotent-reuse guarantee for ad-less threads. That case
  // is handled below by findExistingWithoutAd instead, which uses findFirst.
  describe('findExistingWithoutAd', () => {
    it('queries by (adId: null, buyerId, sellerId) via findFirst, not findUnique', async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);

      await conversationsRepository.findExistingWithoutAd(buyerId, sellerId);

      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: { adId: null, buyerId, sellerId },
      });
      expect(prisma.conversation.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('creates a conversation with the given adId/buyerId/sellerId', async () => {
      (prisma.conversation.create as jest.Mock).mockResolvedValue({ id: 'conv-1' });

      await conversationsRepository.create(buyerId, sellerId, { adId });

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: { buyerId, sellerId, adId, serviceRequestId: null },
      });
    });

    it('creates an ad-less conversation with a null adId', async () => {
      (prisma.conversation.create as jest.Mock).mockResolvedValue({ id: 'conv-1' });

      await conversationsRepository.create(buyerId, sellerId);

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: { buyerId, sellerId, adId: null, serviceRequestId: null },
      });
    });
  });

  describe('findById', () => {
    it('queries by id with the full relations include', async () => {
      (prisma.conversation.findUnique as jest.Mock).mockResolvedValue(null);

      await conversationsRepository.findById('conv-1');

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        include: conversationWithRelationsInclude,
      });
    });
  });

  describe('findManyForUser', () => {
    it('filters by buyerId OR sellerId, ordered by updatedAt desc, with a per-conversation unread _count', async () => {
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.conversation.count as jest.Mock).mockResolvedValue(0);

      await conversationsRepository.findManyForUser(buyerId, {});

      expect(prisma.conversation.findMany).toHaveBeenCalledWith({
        where: { OR: [{ buyerId }, { sellerId: buyerId }] },
        include: {
          ...conversationWithRelationsInclude,
          _count: {
            select: {
              messages: { where: { senderId: { not: buyerId }, readAt: null } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.conversation.count).toHaveBeenCalledWith({
        where: { OR: [{ buyerId }, { sellerId: buyerId }] },
      });
    });

    it('applies pagination skip/take from page and limit', async () => {
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.conversation.count as jest.Mock).mockResolvedValue(0);

      await conversationsRepository.findManyForUser(buyerId, { page: 3, limit: 10 });

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 })
      );
    });

    // FIX UX-15: findManyForUser now maps _count.messages onto a flat
    // unreadCount field per conversation and drops _count from the
    // returned shape — this locks in that mapping.
    it('maps _count.messages onto a flat unreadCount and strips _count', async () => {
      const conversations = [
        { id: 'conv-1', _count: { messages: 3 } },
        { id: 'conv-2', _count: { messages: 0 } },
      ];
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue(conversations);
      (prisma.conversation.count as jest.Mock).mockResolvedValue(2);

      const result = await conversationsRepository.findManyForUser(buyerId, {});

      expect(result).toEqual({
        conversations: [
          { id: 'conv-1', unreadCount: 3 },
          { id: 'conv-2', unreadCount: 0 },
        ],
        total: 2,
      });
    });
  });

  describe('touchUpdatedAt', () => {
    it('updates the row with a fresh updatedAt timestamp', async () => {
      (prisma.conversation.update as jest.Mock).mockResolvedValue({ id: 'conv-1' });

      await conversationsRepository.touchUpdatedAt('conv-1');

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { updatedAt: expect.any(Date) },
      });
    });
  });
});

describe('messagesRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a message with conversationId/senderId/body', async () => {
      (prisma.message.create as jest.Mock).mockResolvedValue({ id: 'msg-1' });

      await messagesRepository.create('conv-1', buyerId, 'Hello');

      expect(prisma.message.create).toHaveBeenCalledWith({
        data: { conversationId: 'conv-1', senderId: buyerId, body: 'Hello' },
      });
    });
  });

  describe('findManyByConversationId', () => {
    it('applies default page/limit (limit defaults to 30, not 20) when the query is empty', async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      await messagesRepository.findManyByConversationId('conv-1', {});

      expect(prisma.message.findMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1' },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 30,
      });
      expect(prisma.message.count).toHaveBeenCalledWith({ where: { conversationId: 'conv-1' } });
    });

    it('applies pagination skip/take from page and limit', async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      await messagesRepository.findManyByConversationId('conv-1', { page: 2, limit: 10 });

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 })
      );
    });

    it('returns the messages and total from the parallel queries', async () => {
      const messages = [{ id: 'msg-1' }, { id: 'msg-2' }];
      (prisma.message.findMany as jest.Mock).mockResolvedValue(messages);
      (prisma.message.count as jest.Mock).mockResolvedValue(2);

      const result = await messagesRepository.findManyByConversationId('conv-1', {});

      expect(result).toEqual({ messages, total: 2 });
    });
  });

  describe('markReadForRecipient', () => {
    it('marks unread messages not sent by the recipient as read', async () => {
      (prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

      const result = await messagesRepository.markReadForRecipient('conv-1', buyerId);

      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { conversationId: 'conv-1', senderId: { not: buyerId }, readAt: null },
        data: { readAt: expect.any(Date) },
      });
      expect(result).toEqual({ count: 3 });
    });
  });

  describe('countUnreadConversationsForUser', () => {
    it('counts conversations with at least one unread inbound message', async () => {
      (prisma.conversation.count as jest.Mock).mockResolvedValue(2);

      const result = await messagesRepository.countUnreadConversationsForUser(buyerId);

      expect(prisma.conversation.count).toHaveBeenCalledWith({
        where: {
          OR: [{ buyerId }, { sellerId: buyerId }],
          messages: { some: { senderId: { not: buyerId }, readAt: null } },
        },
      });
      expect(result).toBe(2);
    });
  });
});
