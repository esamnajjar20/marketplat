import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { getPaginationParams } from '../../../shared/utils/pagination';

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
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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

  // Computes the total and both analytics windows in one round-trip. This
  // avoids three concurrent pool requests every time store analytics loads.
  countAnalyticsByStoreId: async (
    storeId: string,
    since7d: Date,
    since30d: Date
  ): Promise<{ followers: number; newFollowers7d: number; newFollowers30d: number }> => {
    const rows = await prisma.$queryRaw<
      Array<{
        followers: bigint;
        newFollowers7d: bigint;
        newFollowers30d: bigint;
      }>
    >`
      SELECT
        COUNT(*) AS "followers",
        COUNT(*) FILTER (WHERE "createdAt" >= ${since7d}) AS "newFollowers7d",
        COUNT(*) FILTER (WHERE "createdAt" >= ${since30d}) AS "newFollowers30d"
      FROM "store_followers"
      WHERE "storeId" = ${storeId}
    `;
    const row = rows[0];
    return {
      followers: Number(row?.followers ?? 0n),
      newFollowers7d: Number(row?.newFollowers7d ?? 0n),
      newFollowers30d: Number(row?.newFollowers30d ?? 0n),
    };
  },

  // Retained for callers that need a single-window count.
  countByStoreIdSince: (storeId: string, since: Date): Promise<number> =>
    prisma.storeFollower.count({ where: { storeId, createdAt: { gte: since } } }),
};
