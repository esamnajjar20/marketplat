import { Prisma, SavedSearch } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import type { SavedSearchFilters } from './saved-searches.validation';

// Saved-search matching is performed in Node because the match rules vary by
// listing kind and are intentionally kept in the service layer. Read the rows
// through a stable keyset stream rather than materializing a platform-wide
// array. The snapshot cutoff excludes searches created after this scan starts.
const MATCHING_BATCH_SIZE = 500;

export const savedSearchesRepository = {
  findManyByUserId: (userId: string): Promise<SavedSearch[]> =>
    prisma.savedSearch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),

  countByUserId: (userId: string): Promise<number> =>
    prisma.savedSearch.count({ where: { userId } }),

  findById: (id: string): Promise<SavedSearch | null> =>
    prisma.savedSearch.findUnique({ where: { id } }),

  create: (userId: string, label: string, filters: SavedSearchFilters): Promise<SavedSearch> =>
    prisma.savedSearch.create({
      data: { userId, label, filters: filters as unknown as Prisma.InputJsonValue },
    }),

  delete: async (id: string, userId: string): Promise<Prisma.BatchPayload> =>
    // Scoped by userId in the WHERE clause (not just id) so this can
    // never delete another user's saved search even if a caller's
    // ownership check above it is ever skipped — same belt-and-suspenders
    // pattern as favoritesRepository.delete's unique compound key.
    prisma.savedSearch.deleteMany({ where: { id, userId } }),

  /**
   * Stream every saved search in bounded primary-key pages. Snapshotting the
   * creation cutoff makes the scan finite even while users create new searches;
   * a later event will consider those newer rows. Updates/deletes remain
   * naturally visible at the moment each page is read.
   */
  async *iterateAllForMatching(
    snapshotAt: Date = new Date(),
    batchSize = MATCHING_BATCH_SIZE
  ): AsyncGenerator<SavedSearch[]> {
    const take = Math.max(1, Math.min(1000, Math.floor(batchSize) || MATCHING_BATCH_SIZE));
    let cursor: string | undefined;
    while (true) {
      const rows = await prisma.savedSearch.findMany({
        where: {
          createdAt: { lte: snapshotAt },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        orderBy: { id: 'asc' },
        take,
      });
      if (rows.length === 0) return;
      yield rows;
      cursor = rows[rows.length - 1]!.id;
      if (rows.length < take) return;
    }
  },

  markNotified: (ids: string[]): Promise<Prisma.BatchPayload> =>
    prisma.savedSearch.updateMany({
      where: { id: { in: ids } },
      data: { lastNotifiedAt: new Date() },
    }),
};
