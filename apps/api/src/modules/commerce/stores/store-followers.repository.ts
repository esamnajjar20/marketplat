import { prisma } from '../../../config/prisma';
import { Prisma } from '@prisma/client';
import { getPaginationParams } from '../../../shared/http/pagination';

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

  /**
   * Stream follower IDs in bounded keyset pages for notification fan-out.
   * The stable primary-key cursor avoids materializing every follower in Node.
   */
  async *findUserIdsByStoreId(storeId: string, batchSize = 500): AsyncGenerator<string[]> {
    const size = Math.min(500, Math.max(1, Math.trunc(batchSize) || 500));
    let cursor: string | undefined;
    while (true) {
      const rows = await prisma.storeFollower.findMany({
        where: { storeId, ...(cursor ? { id: { gt: cursor } } : {}) },
        orderBy: { id: 'asc' },
        take: size,
        select: { id: true, userId: true },
      });
      if (rows.length === 0) return;
      yield rows.map(row => row.userId);
      cursor = rows[rows.length - 1].id;
      if (rows.length < size) return;
    }
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
