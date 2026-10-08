import { prisma } from '../config/prisma';
import { deleteMedia } from '../config/cloudinary';
import { logger } from '../shared/utils/logger';

async function main(): Promise<void> {
  let deleted = 0;
  const now = new Date();
  while (true) {
    const rows = await prisma.story.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true, mediaPublicId: true },
      take: 100,
      orderBy: { expiresAt: 'asc' },
    });
    if (!rows.length) break;

    for (const row of rows) {
      if (row.mediaPublicId) {
        try { await deleteMedia(row.mediaPublicId); } catch (error) {
          logger.warn('Expired story media cleanup failed; keeping row for retry', { storyId: row.id, error });
          continue;
        }
      }
      await prisma.story.delete({ where: { id: row.id } });
      deleted += 1;
    }
  }
  logger.info('cleanupExpiredStories finished', { deleted });
}

main().catch((error) => {
  logger.error('cleanupExpiredStories failed', { error });
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
