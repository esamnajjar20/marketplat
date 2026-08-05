import { blockedUsersRepository } from '../../src/modules/blocked-users/blocked-users.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    userBlock: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const blockerId = 'user-1';
const blockedId = 'user-2';

describe('blockedUsersRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findByBlockerAndBlocked', () => {
    it('queries by the composite blockerId_blockedId unique key', async () => {
      (prisma.userBlock.findUnique as jest.Mock).mockResolvedValue(null);
      await blockedUsersRepository.findByBlockerAndBlocked(blockerId, blockedId);
      expect(prisma.userBlock.findUnique).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId, blockedId } },
      });
    });
  });

  describe('create', () => {
    it('creates a block row for the given blocker and blocked user', async () => {
      (prisma.userBlock.create as jest.Mock).mockResolvedValue({ id: 'b-1' });
      await blockedUsersRepository.create(blockerId, blockedId);
      expect(prisma.userBlock.create).toHaveBeenCalledWith({ data: { blockerId, blockedId } });
    });
  });

  describe('delete', () => {
    it('deletes by the composite blockerId_blockedId unique key', async () => {
      (prisma.userBlock.delete as jest.Mock).mockResolvedValue({});
      await blockedUsersRepository.delete(blockerId, blockedId);
      expect(prisma.userBlock.delete).toHaveBeenCalledWith({
        where: { blockerId_blockedId: { blockerId, blockedId } },
      });
    });
  });

  describe('findManyByBlockerId', () => {
    it('scopes to the blocker with default pagination', async () => {
      (prisma.userBlock.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userBlock.count as jest.Mock).mockResolvedValue(0);

      await blockedUsersRepository.findManyByBlockerId(blockerId, {});

      expect(prisma.userBlock.findMany).toHaveBeenCalledWith({
        where: { blockerId },
        include: { blocked: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.userBlock.count).toHaveBeenCalledWith({ where: { blockerId } });
    });

    it('applies custom page/limit', async () => {
      (prisma.userBlock.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.userBlock.count as jest.Mock).mockResolvedValue(0);

      await blockedUsersRepository.findManyByBlockerId(blockerId, { page: 2, limit: 5 });

      expect(prisma.userBlock.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 })
      );
    });

    it('returns blocks and total', async () => {
      const blocks = [{ id: 'b-1' }];
      (prisma.userBlock.findMany as jest.Mock).mockResolvedValue(blocks);
      (prisma.userBlock.count as jest.Mock).mockResolvedValue(1);

      const result = await blockedUsersRepository.findManyByBlockerId(blockerId, {});

      expect(result).toEqual({ blocks, total: 1 });
    });
  });

  describe('existsEitherDirection', () => {
    it('queries both directions with an OR', async () => {
      (prisma.userBlock.count as jest.Mock).mockResolvedValue(0);

      await blockedUsersRepository.existsEitherDirection('user-a', 'user-b');

      expect(prisma.userBlock.count).toHaveBeenCalledWith({
        where: {
          OR: [
            { blockerId: 'user-a', blockedId: 'user-b' },
            { blockerId: 'user-b', blockedId: 'user-a' },
          ],
        },
      });
    });

    it('returns true when a block exists in either direction', async () => {
      (prisma.userBlock.count as jest.Mock).mockResolvedValue(1);
      const result = await blockedUsersRepository.existsEitherDirection('user-a', 'user-b');
      expect(result).toBe(true);
    });

    it('returns false when no block exists', async () => {
      (prisma.userBlock.count as jest.Mock).mockResolvedValue(0);
      const result = await blockedUsersRepository.existsEitherDirection('user-a', 'user-b');
      expect(result).toBe(false);
    });
  });
});
