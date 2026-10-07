import { conversationsRepository, messagesRepository } from '../../src/modules/conversations/conversations.repository';
import { prisma } from '../../src/config/prisma';

import { Prisma } from '@prisma/client';

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

  describe('findByUserPair', () => {
    // FEAT-CONV-DEDUP: identity is the (buyerId, sellerId) pair
    // regardless of which column either user landed in, so the lookup
    // must check both orderings in one query, not just the exact
    // ordering passed in.
    it('queries by findFirst with both (buyerId, sellerId) orderings', async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);

      await conversationsRepository.findByUserPair(buyerId, sellerId);

      expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { buyerId, sellerId },
            { buyerId: sellerId, sellerId: buyerId },
          ],
        },
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

  describe('findOrCreate', () => {
    it('returns the existing conversation for the pair without calling create', async () => {
      const existing = { id: 'conv-1', buyerId, sellerId };
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(existing);

      const result = await conversationsRepository.findOrCreate(buyerId, sellerId, { adId });

      expect(result).toEqual(existing);
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('creates a new conversation when no existing pair is found', async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);
      const created = { id: 'conv-1', buyerId, sellerId, adId };
      (prisma.conversation.create as jest.Mock).mockResolvedValue(created);

      const result = await conversationsRepository.findOrCreate(buyerId, sellerId, { adId });

      expect(prisma.conversation.create).toHaveBeenCalledWith({
        data: { buyerId, sellerId, adId, serviceRequestId: null },
      });
      expect(result).toEqual(created);
    });

    // The core race-condition guarantee: two concurrent callers can both
    // pass the initial findFirst (neither sees the other's row yet), then
    // both call create(). The loser's insert violates the DB's
    // @@unique([buyerId, sellerId]) and throws P2002 — that must be
    // caught and turned into "fetch and return the winner's row", not a
    // user-facing error, and must never leave the caller with zero
    // conversations or an unhandled rejection.
    it('on a P2002 unique conflict, refetches and returns the winning conversation instead of throwing', async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValueOnce(null);
      const conflictError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['buyerId', 'sellerId'] },
      });
      (prisma.conversation.create as jest.Mock).mockRejectedValue(conflictError);
      const winner = { id: 'conv-winner', buyerId, sellerId };
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValueOnce(winner);

      const result = await conversationsRepository.findOrCreate(buyerId, sellerId, { adId });

      expect(result).toEqual(winner);
      expect(prisma.conversation.findFirst).toHaveBeenCalledTimes(2);
    });

    it('rethrows a P2002 conflict if the refetch somehow still finds nothing', async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);
      const conflictError = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['buyerId', 'sellerId'] },
      });
      (prisma.conversation.create as jest.Mock).mockRejectedValue(conflictError);

      await expect(conversationsRepository.findOrCreate(buyerId, sellerId)).rejects.toBe(
        conflictError
      );
    });

    it('rethrows a non-P2002 error from create without swallowing it', async () => {
      (prisma.conversation.findFirst as jest.Mock).mockResolvedValue(null);
      const dbError = new Error('connection lost');
      (prisma.conversation.create as jest.Mock).mockRejectedValue(dbError);

      await expect(conversationsRepository.findOrCreate(buyerId, sellerId)).rejects.toBe(dbError);
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
              messages: { where: { senderId: { not: buyerId }, readAt: null, deletedAt: null } },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
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

    // findManyForUser now maps _count.messages onto a flat
    // unreadCount field per conversation and drops _count from the
    // returned shape — this locks in that mapping.
    // also maps the included `messages` (newest first, take 1)
    // onto a flat lastMessage field, falling back to null when absent.
    it('maps _count.messages onto a flat unreadCount and strips _count', async () => {
      const conversations = [
        { id: 'conv-1', _count: { messages: 3 }, messages: [{ id: 'msg-1', body: 'hi' }] },
        { id: 'conv-2', _count: { messages: 0 }, messages: [] },
      ];
      (prisma.conversation.findMany as jest.Mock).mockResolvedValue(conversations);
      (prisma.conversation.count as jest.Mock).mockResolvedValue(2);

      const result = await conversationsRepository.findManyForUser(buyerId, {});

      expect(result).toEqual({
        conversations: [
          { id: 'conv-1', unreadCount: 3, lastMessage: { id: 'msg-1', body: 'hi' } },
          { id: 'conv-2', unreadCount: 0, lastMessage: null },
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
    it('uses deterministic newest-first ordering and fetches one extra row for cursor pagination', async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.count as jest.Mock).mockResolvedValue(0);

      const result = await messagesRepository.findManyByConversationId('conv-1', {});

      expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { conversationId: 'conv-1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 31,
      }));
      expect(result).toEqual({ messages: [], total: 0, nextCursor: null });
    });

    it('applies a stable before cursor instead of OFFSET', async () => {
      (prisma.message.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.message.count as jest.Mock).mockResolvedValue(0);
      const before = Buffer.from(JSON.stringify({ createdAt: '2026-01-01T00:00:00.000Z', id: 'msg-10' })).toString('base64url');

      await messagesRepository.findManyByConversationId('conv-1', { before, limit: 10 });

      expect(prisma.message.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: {
          conversationId: 'conv-1',
          OR: [
            { createdAt: { lt: new Date('2026-01-01T00:00:00.000Z') } },
            { createdAt: new Date('2026-01-01T00:00:00.000Z'), id: { lt: 'msg-10' } },
          ],
        },
        take: 11,
      }));
    });

    it('returns a cursor only when another older row exists', async () => {
      const rows = [
        { id: 'msg-2', createdAt: new Date('2026-01-02T00:00:00.000Z') },
        { id: 'msg-1', createdAt: new Date('2026-01-01T00:00:00.000Z') },
      ];
      (prisma.message.findMany as jest.Mock).mockResolvedValue(rows);
      (prisma.message.count as jest.Mock).mockResolvedValue(2);

      const result = await messagesRepository.findManyByConversationId('conv-1', { limit: 1 });

      expect(result.messages).toEqual([rows[0]]);
      expect(result.total).toBe(2);
      expect(result.nextCursor).toBeTruthy();
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
          messages: { some: { senderId: { not: buyerId }, readAt: null, deletedAt: null } },
        },
      });
      expect(result).toBe(2);
    });
  });
});
