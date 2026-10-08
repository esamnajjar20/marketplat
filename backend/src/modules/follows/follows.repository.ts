import { FollowTargetType, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { getPaginationParams } from '../../shared/utils/pagination';

export type FollowRow = Prisma.FollowGetPayload<{}>;

export const followsRepository = {
  find: (followerId: string, targetType: FollowTargetType, targetId: string) =>
    prisma.follow.findUnique({
      where: { followerId_targetType_targetId: { followerId, targetType, targetId } },
    }),

  create: (followerId: string, targetType: FollowTargetType, targetId: string) =>
    prisma.follow.create({ data: { followerId, targetType, targetId } }),

  delete: async (followerId: string, targetType: FollowTargetType, targetId: string) => {
    await prisma.follow.delete({
      where: { followerId_targetType_targetId: { followerId, targetType, targetId } },
    });
  },

  listFollowing: async (followerId: string, targetType: FollowTargetType | undefined, page = 1, limit = 20) => {
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.FollowWhereInput = { followerId, ...(targetType ? { targetType } : {}) };
    const [items, total] = await Promise.all([
      prisma.follow.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.follow.count({ where }),
    ]);
    return { items, total };
  },

  listFollowersOfUser: async (targetId: string, page = 1, limit = 20) =>
    followsRepository.listFollowers(FollowTargetType.USER, targetId, page, limit),

  listFollowersOfTarget: async (targetType: FollowTargetType, targetId: string, page = 1, limit = 20) =>
    followsRepository.listFollowers(targetType, targetId, page, limit),

  listFollowers: async (targetType: FollowTargetType, targetId: string, page = 1, limit = 20) => {
    const { skip, take } = getPaginationParams(page, limit);
    const where = { targetType, targetId };
    const [items, total] = await Promise.all([
      prisma.follow.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.follow.count({ where }),
    ]);
    return { items, total };
  },

  findFollowerIds: async (targetType: FollowTargetType, targetIds: string[]): Promise<string[]> => {
    if (!targetIds.length) return [];
    const rows = await prisma.follow.findMany({
      where: { targetType, targetId: { in: targetIds } },
      select: { followerId: true },
    });
    return Array.from(new Set(rows.map((row) => row.followerId)));
  },

  countFollowers: (targetType: FollowTargetType, targetId: string) =>
    prisma.follow.count({ where: { targetType, targetId } }),

  countFollowing: (followerId: string, targetType?: FollowTargetType) =>
    prisma.follow.count({ where: { followerId, ...(targetType ? { targetType } : {}) } }),
};
