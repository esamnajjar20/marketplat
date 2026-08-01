import { storeFollowersRepository } from '../../src/modules/stores/store-followers.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    storeFollower: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const userId = 'user-1';
const storeId = 'store-1';

describe('storeFollowersRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findByUserAndStore', () => {
    it('queries by the composite userId_storeId unique key', async () => {
      (prisma.storeFollower.findUnique as jest.Mock).mockResolvedValue(null);
      await storeFollowersRepository.findByUserAndStore(userId, storeId);
      expect(prisma.storeFollower.findUnique).toHaveBeenCalledWith({
        where: { userId_storeId: { userId, storeId } },
      });
    });
  });

  describe('create', () => {
    it('creates a follow row for the given user and store', async () => {
      (prisma.storeFollower.create as jest.Mock).mockResolvedValue({ id: 'f-1' });
      await storeFollowersRepository.create(userId, storeId);
      expect(prisma.storeFollower.create).toHaveBeenCalledWith({ data: { userId, storeId } });
    });
  });

  describe('delete', () => {
    it('deletes by the composite userId_storeId unique key', async () => {
      (prisma.storeFollower.delete as jest.Mock).mockResolvedValue({});
      await storeFollowersRepository.delete(userId, storeId);
      expect(prisma.storeFollower.delete).toHaveBeenCalledWith({
        where: { userId_storeId: { userId, storeId } },
      });
    });
  });

  describe('findManyByUserId', () => {
    it('scopes to the user and only ACTIVE stores, with default pagination', async () => {
      (prisma.storeFollower.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.storeFollower.count as jest.Mock).mockResolvedValue(0);

      await storeFollowersRepository.findManyByUserId(userId, {});

      expect(prisma.storeFollower.findMany).toHaveBeenCalledWith({
        where: { userId, store: { status: 'ACTIVE' } },
        include: { store: { include: { sellerProfile: true } } },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.storeFollower.count).toHaveBeenCalledWith({
        where: { userId, store: { status: 'ACTIVE' } },
      });
    });

    it('applies custom page/limit', async () => {
      (prisma.storeFollower.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.storeFollower.count as jest.Mock).mockResolvedValue(0);

      await storeFollowersRepository.findManyByUserId(userId, { page: 2, limit: 5 });

      expect(prisma.storeFollower.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 })
      );
    });

    it('returns follows and total', async () => {
      const follows = [{ id: 'f-1' }];
      (prisma.storeFollower.findMany as jest.Mock).mockResolvedValue(follows);
      (prisma.storeFollower.count as jest.Mock).mockResolvedValue(1);

      const result = await storeFollowersRepository.findManyByUserId(userId, {});

      expect(result).toEqual({ follows, total: 1 });
    });
  });

  describe('findUserIdsByStoreId', () => {
    it('queries follower userIds for the given storeId', async () => {
      (prisma.storeFollower.findMany as jest.Mock).mockResolvedValue([
        { userId: 'u-1' },
        { userId: 'u-2' },
      ]);

      const result = await storeFollowersRepository.findUserIdsByStoreId(storeId);

      expect(prisma.storeFollower.findMany).toHaveBeenCalledWith({
        where: { storeId },
        select: { userId: true },
      });
      expect(result).toEqual(['u-1', 'u-2']);
    });

    it('returns an empty array when the store has no followers', async () => {
      (prisma.storeFollower.findMany as jest.Mock).mockResolvedValue([]);
      const result = await storeFollowersRepository.findUserIdsByStoreId(storeId);
      expect(result).toEqual([]);
    });
  });

  describe('countByStoreId', () => {
    it('counts followers scoped to storeId', async () => {
      (prisma.storeFollower.count as jest.Mock).mockResolvedValue(3);
      const result = await storeFollowersRepository.countByStoreId(storeId);
      expect(prisma.storeFollower.count).toHaveBeenCalledWith({ where: { storeId } });
      expect(result).toBe(3);
    });
  });
});
