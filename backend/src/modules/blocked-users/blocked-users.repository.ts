import { prisma } from '../../config/prisma';
import { Prisma, UserBlock } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export type UserBlockWithBlockedUser = Prisma.UserBlockGetPayload<{
  include: { blocked: { select: { id: true; name: true; avatarUrl: true } } };
}>;

export const blockedUsersRepository = {
  findByBlockerAndBlocked: (blockerId: string, blockedId: string): Promise<UserBlock | null> =>
    prisma.userBlock.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    }),

  create: (blockerId: string, blockedId: string): Promise<UserBlock> =>
    prisma.userBlock.create({ data: { blockerId, blockedId } }),

  delete: async (blockerId: string, blockedId: string): Promise<void> => {
    await prisma.userBlock.delete({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
  },

  /** Every user the caller has blocked, most-recently-blocked first —
   * powers the "manage blocked users" settings list. Mirrors
   * storeFollowersRepository.findManyByUserId's page/limit shape. */
  findManyByBlockerId: async (
    blockerId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ blocks: UserBlockWithBlockedUser[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.UserBlockWhereInput = { blockerId };

    const [blocks, total] = await Promise.all([
      prisma.userBlock.findMany({
        where,
        include: { blocked: { select: { id: true, name: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.userBlock.count({ where }),
    ]);

    return { blocks, total };
  },

  /** True if either user has blocked the other — the only check
   * conversations/messages need, since the block is meant to stop
   * contact in both directions regardless of who initiated it. A single
   * OR query rather than two findUnique calls, so call sites that only
   * need the boolean (conversations.service) don't pay for two round
   * trips. */
  existsEitherDirection: async (userIdA: string, userIdB: string): Promise<boolean> => {
    const count = await prisma.userBlock.count({
      where: {
        OR: [
          { blockerId: userIdA, blockedId: userIdB },
          { blockerId: userIdB, blockedId: userIdA },
        ],
      },
    });
    return count > 0;
  },
};
