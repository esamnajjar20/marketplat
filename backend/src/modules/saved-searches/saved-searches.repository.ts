import { Prisma, SavedSearch } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { logger } from '../../shared/utils/logger';
import type { SavedSearchFilters } from './saved-searches.validation';

// AUDIT-FIX 1.8: findAllForMatching had no cap at all — with
// MAX_SAVED_SEARCHES_PER_USER (saved-searches.service.ts) bounding rows
// per user but no bound across users, this grows unbounded with the
// user base. A full scheduled/batched matcher redesign (per the scale
// note on savedSearchEvents.onAdCreated) is out of scope for a targeted
// fix and risks the current real-time notification behavior. This is a
// deliberately blunt safety net, not a redesign: a hard application-level
// ceiling so a single onAdCreated call can never pull an unbounded
// result set, with a log warning when it's actually hit so growth past
// this point gets noticed and prioritized rather than silently capping
// matches forever.
const HARD_MATCHING_CEILING = 5000;

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
   * newly created ad. See savedSearches.service.ts's onAdCreated for
   * why in-Node filtering (vs. pushing the match into SQL) is the right
   * tradeoff at current scale.
   *
   * AUDIT-FIX 1.8: capped at HARD_MATCHING_CEILING as a safety net, not
   * a design decision — see that constant's comment. Ordered by
   * createdAt so, if the ceiling is ever actually hit, older saved
   * searches (statistically the most likely to still be relevant/active)
   * are the ones kept rather than an arbitrary DB-order slice.
   */
  findAllForMatching: async (): Promise<SavedSearch[]> => {
    const rows = await prisma.savedSearch.findMany({
      orderBy: { createdAt: 'asc' },
      take: HARD_MATCHING_CEILING,
    });
    if (rows.length === HARD_MATCHING_CEILING) {
      logger.warn(
        `savedSearchesRepository.findAllForMatching hit HARD_MATCHING_CEILING (${HARD_MATCHING_CEILING}) — ` +
          'saved-search volume has outgrown the in-Node matching approach; newer saved searches beyond ' +
          'this cap are not being matched against new ads. Needs a scheduled/batched matcher redesign.'
      );
    }
    return rows;
  },

  markNotified: (ids: string[]): Promise<Prisma.BatchPayload> =>
    prisma.savedSearch.updateMany({
      where: { id: { in: ids } },
      data: { lastNotifiedAt: new Date() },
    }),
};
