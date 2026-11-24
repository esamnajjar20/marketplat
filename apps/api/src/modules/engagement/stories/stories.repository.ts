import { Prisma } from '@prisma/client';
import { prisma } from '../../../config/prisma';

const STORY_VIEWERS_LIST_LIMIT = 500;

export const storiesRepository = {
  create: (data: Prisma.StoryCreateInput) => prisma.story.create({ data }),
  findActiveById: (id: string) =>
    prisma.story.findFirst({ where: { id, expiresAt: { gt: new Date() } } }),
  findById: (id: string) => prisma.story.findUnique({ where: { id } }),
  /**
   * Bound the feed to the 50 most recently active followed authors plus the
   * viewer. Resolve the follow graph and block policy inside SQL rather than
   * materializing an unbounded followed-user ID array in application memory.
   */
  listActiveAuthorIdsForFeed: async (viewerId: string, limit = 50): Promise<string[]> => {
    const safeLimit = Math.max(1, Math.min(50, Math.trunc(limit || 50)));
    const rows = await prisma.$queryRaw<Array<{ userId: string }>>`
      WITH followed_authors AS (
        SELECT follow."targetId" AS "userId"
        FROM "follows" AS follow
        WHERE follow."followerId" = ${viewerId}
          AND follow."targetType"::text = 'USER'
        UNION
        SELECT ${viewerId} AS "userId"
      )
      SELECT story."userId"
      FROM followed_authors AS author
      INNER JOIN "stories" AS story ON story."userId" = author."userId"
      WHERE story."expiresAt" > NOW()
        AND (
          author."userId" = ${viewerId}
          OR NOT EXISTS (
            SELECT 1
            FROM "user_blocks" AS block
            WHERE (block."blockerId" = ${viewerId} AND block."blockedId" = author."userId")
               OR (block."blockerId" = author."userId" AND block."blockedId" = ${viewerId})
          )
        )
      GROUP BY story."userId"
      ORDER BY
        CASE WHEN story."userId" = ${viewerId} THEN 0 ELSE 1 END ASC,
        MAX(story."createdAt") DESC,
        story."userId" ASC
      LIMIT ${safeLimit}
    `;
    return rows.map(row => row.userId);
  },
  listActiveForUsers: async (userIds: string[], limitPerUser = 20) => {
    if (userIds.length === 0) return [];
    const now = new Date();
    // Rank each author's active stories independently. This returns the
    // newest N for every followed author, then orders each author's stories
    // oldest-to-newest for playback. There is no silent global 500-row cap.
    const ranked = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT ranked."id"
      FROM (
        SELECT
          "id",
          "userId",
          "createdAt",
          ROW_NUMBER() OVER (
            PARTITION BY "userId"
            ORDER BY "createdAt" DESC, "id" DESC
          ) AS author_rank
        FROM "stories"
        WHERE "userId" IN (${Prisma.join(userIds)})
          AND "expiresAt" > ${now}
      ) AS ranked
      WHERE ranked.author_rank <= ${Math.max(1, Math.min(20, Math.trunc(limitPerUser || 20)))}
      ORDER BY ranked."userId" ASC, ranked."createdAt" ASC, ranked."id" ASC
    `;
    if (ranked.length === 0) return [];
    const ids = ranked.map((row) => row.id);
    const rows = await prisma.story.findMany({
      where: { id: { in: ids } },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { views: true } },
      },
    });
    const byId = new Map(rows.map((story) => [story.id, story]));
    return ids.flatMap((id) => {
      const story = byId.get(id);
      return story ? [story] : [];
    });
  },
  listActiveForUser: (userId: string) =>
    prisma.story.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, name: true, avatarUrl: true } },
        _count: { select: { views: true } },
      },
    }),
  findView: (storyId: string, viewerId: string) =>
    prisma.storyView.findUnique({ where: { storyId_viewerId: { storyId, viewerId } } }),
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
      // Bounded: a popular story can collect thousands of views and this list
      // is rendered in one sheet. The exact total comes from countViews().
      take: STORY_VIEWERS_LIST_LIMIT,
      include: { viewer: { select: { id: true, name: true, avatarUrl: true } } },
    }),
  delete: (id: string, userId: string) => prisma.story.deleteMany({ where: { id, userId } }),
};
