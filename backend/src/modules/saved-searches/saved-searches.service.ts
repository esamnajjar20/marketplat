import { SavedSearch } from '@prisma/client';
import { savedSearchesRepository } from './saved-searches.repository';
import { notificationEvents } from '../notifications';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import type { CreateSavedSearchInput, SavedSearchFilters } from './saved-searches.validation';
import type { AdWithAuthor } from '../ads/ads.repository';

// Mirrors env.ads.maxPerUser's role for the ads module — a plain
// constant rather than a new env var, since this doesn't need to be
// ops-tunable the way ad-posting limits are; it's just a sane ceiling
// against one user accumulating hundreds of stored filter sets.
const MAX_SAVED_SEARCHES_PER_USER = 20;

/**
 * True if `ad` satisfies every criterion present in `filters`. Absent
 * filter keys are unconstrained (match any value) — same semantics as
 * GET /ads's optional query params. `q` matches the same way the ILIKE
 * search does on title/description (ads.repository.ts's search branch):
 * case-insensitive substring, checked against title only here since the
 * full ad description isn't loaded onto AdWithAuthor's select in every
 * caller — title is what a saved-search notification body shows anyway.
 */
function matchesFilters(ad: AdWithAuthor, filters: SavedSearchFilters): boolean {
  if (filters.q && !ad.title.toLowerCase().includes(filters.q.toLowerCase())) return false;
  if (filters.city && ad.city.toLowerCase() !== filters.city.toLowerCase()) return false;
  if (filters.categoryId && ad.categoryId !== filters.categoryId) return false;
  if (filters.condition && ad.condition !== filters.condition) return false;

  const price = ad.price !== null ? Number(ad.price) : null;
  if (filters.minPrice !== undefined && (price === null || price < filters.minPrice)) return false;
  if (filters.maxPrice !== undefined && (price === null || price > filters.maxPrice)) return false;

  return true;
}

export const savedSearchesService = {
  getMySavedSearches: (userId: string): Promise<SavedSearch[]> =>
    savedSearchesRepository.findManyByUserId(userId),

  createSavedSearch: async (
    userId: string,
    input: CreateSavedSearchInput
  ): Promise<SavedSearch> => {
    const count = await savedSearchesRepository.countByUserId(userId);
    if (count >= MAX_SAVED_SEARCHES_PER_USER) {
      throw new BadRequestError(
        `You have reached the maximum number of saved searches (${MAX_SAVED_SEARCHES_PER_USER}).`,
        'SAVED_SEARCH_LIMIT_REACHED',
        { maxPerUser: MAX_SAVED_SEARCHES_PER_USER }
      );
    }
    return savedSearchesRepository.create(userId, input.label, input.filters);
  },

  deleteSavedSearch: async (id: string, userId: string): Promise<void> => {
    const result = await savedSearchesRepository.delete(id, userId);
    if (result.count === 0) {
      throw new NotFoundError('Saved search not found', 'SAVED_SEARCH_NOT_FOUND');
    }
  },
};

/**
 * Event-triggered matcher — called from ads.service.ts's createAd, same
 * fire-and-forget contract as notifications.service.ts's
 * notificationEvents (never awaited inline with the ad-creation
 * transaction; a matching failure must never fail ad creation itself).
 *
 * Scale note: this loads every SavedSearch row and filters in Node
 * rather than pushing the match down into a SQL WHERE clause. That's
 * the right tradeoff at this project's current size (saved searches are
 * a new, low-volume feature; MAX_SAVED_SEARCHES_PER_USER bounds rows
 * per user) and it keeps matchesFilters as one readable, testable
 * function instead of hand-built dynamic SQL. If saved-search volume
 * grows large enough for this to matter, the fix is a scheduled/batched
 * matcher (or a proper search index) — not a change to this function's
 * logic, just to when/how often it runs.
 */
export const savedSearchEvents = {
  onAdCreated: async (ad: AdWithAuthor): Promise<void> => {
    const searches = await savedSearchesRepository.findAllForMatching();
    // A seller's own saved search matching their own new ad would be a
    // confusing, useless notification ("your search matched the ad you
    // just posted") — exclude it the same way SellerCard/conversations
    // already treat "acting on your own ad" as a no-op case elsewhere.
    const candidates = searches.filter((s) => s.userId !== ad.userId);

    const matched = candidates.filter((s) =>
      matchesFilters(ad, s.filters as unknown as SavedSearchFilters)
    );
    if (matched.length === 0) return;

    await notificationEvents.onSavedSearchMatched(
      matched.map((s) => ({ userId: s.userId, savedSearchId: s.id, label: s.label })),
      ad.id,
      ad.title
    );
    await savedSearchesRepository.markNotified(matched.map((s) => s.id));
  },
};

// Exported for unit tests only — not part of the module's public API
// surface used by other modules.
export const __testables__ = { matchesFilters };
