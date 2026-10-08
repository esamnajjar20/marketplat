import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';

export const storiesRepository = {
  create: (data: Prisma.StoryCreateInput) => prisma.story.create({ data }),
  findActiveById: (id: string) => prisma.story.findFirst({ where: { id, expiresAt: { gt: new Date() } } }),
  findById: (id: string) => prisma.story.findUnique({ where: { id } }),
  listActiveForUsers: (userIds: string[], limitPerUser = 20) =>
    prisma.story.findMany({
      where: { userId: { in: userIds }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      take: Math.min(500, Math.max(1, userIds.length * limitPerUser)),
      include: { user: { select: { id: true, name: true, avatarUrl: true } }, _count: { select: { views: true } } },
    }),
  listActiveForUser: (userId: string) =>
    prisma.story.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, avatarUrl: true } }, _count: { select: { views: true } } },
    }),
  findView: (storyId: string, viewerId: string) => prisma.storyView.findUnique({ where: { storyId_viewerId: { storyId, viewerId } } }),
  createView: (storyId: string, viewerId: string) =>
    prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId, viewerId } },
      create: { storyId, viewerId },
      update: { viewedAt: new Date() },
    }),
  countViews: (storyId: string) => prisma.storyView.count({ where: { storyId } }),
  listViewers: (storyId: string) =>
    prisma.storyView.findMany({
      where: { storyId },
      orderBy: { viewedAt: 'desc' },
      include: { viewer: { select: { id: true, name: true, avatarUrl: true } } },
    }),
  delete: (id: string, userId: string) => prisma.story.deleteMany({ where: { id, userId } }),
};
