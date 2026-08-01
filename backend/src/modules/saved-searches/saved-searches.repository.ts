import { Prisma, SavedSearch } from '@prisma/client';
import { prisma } from '../../config/prisma';
import type { SavedSearchFilters } from './saved-searches.validation';

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
   * All saved searches across all users, for matching against a single
   * newly created ad. Deliberately unpaginated/unbounded — see
   * savedSearches.service.ts's onAdCreated for why this is acceptable at
   * current scale, and what the ceiling assumption is.
   */
  findAllForMatching: (): Promise<SavedSearch[]> => prisma.savedSearch.findMany(),

  markNotified: (ids: string[]): Promise<Prisma.BatchPayload> =>
    prisma.savedSearch.updateMany({
      where: { id: { in: ids } },
      data: { lastNotifiedAt: new Date() },
    }),
};
