import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export type StoreFollowerWithStore = Prisma.StoreFollowerGetPayload<{
  include: { store: { include: { sellerProfile: true } } };
}>;

export const storeFollowersRepository = {
  findByUserAndStore: (userId: string, storeId: string) =>
    prisma.storeFollower.findUnique({ where: { userId_storeId: { userId, storeId } } }),

  create: (userId: string, storeId: string) =>
    prisma.storeFollower.create({ data: { userId, storeId } }),

  delete: async (userId: string, storeId: string): Promise<void> => {
    await prisma.storeFollower.delete({ where: { userId_storeId: { userId, storeId } } });
  },

  findManyByUserId: async (
    userId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ follows: StoreFollowerWithStore[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.StoreFollowerWhereInput = { userId, store: { status: 'ACTIVE' } };

    const [follows, total] = await Promise.all([
      prisma.storeFollower.findMany({
        where,
        include: { store: { include: { sellerProfile: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.storeFollower.count({ where }),
    ]);

    return { follows, total };
  },

  /** Used only to fan out STORE_NEW_PRODUCT notifications when a store
   * publishes a new product — same role as
   * favoritesRepository.findUserIdsByAdId. */
  findUserIdsByStoreId: async (storeId: string): Promise<string[]> => {
    const followers = await prisma.storeFollower.findMany({
      where: { storeId },
      select: { userId: true },
    });
    return followers.map(f => f.userId);
  },

  countByStoreId: (storeId: string): Promise<number> =>
    prisma.storeFollower.count({ where: { storeId } }),
};
