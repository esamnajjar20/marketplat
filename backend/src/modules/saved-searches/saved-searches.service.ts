import { SavedSearch, Product, ServiceListing } from '@prisma/client';
import { savedSearchesRepository } from './saved-searches.repository';
import { notificationEvents } from '../notifications';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { withSavedSearchCreationLock } from '../../shared/utils/adLock';
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
 * case-insensitive substring, checked against both title and
 * description.
 *
 * AUDIT-FIX (5.11/9.7): this previously checked `title` only, with a
 * comment claiming `description` "isn't loaded onto AdWithAuthor's
 * select in every caller" — but AdWithAuthor is built from `include`
 * (not `select`), so it always carries every scalar Ad column
 * including description, and matchesFilters has exactly one caller
 * (savedSearchEvents.onAdCreated below), fed directly from
 * ads.service.ts's `tx.ad.create({ include: {...} })` result. An ad
 * that matched a saved search's `q` only through its description (not
 * its title) previously never triggered the match notification at all.
 */
function matchesAdFilters(ad: AdWithAuthor, filters: SavedSearchFilters): boolean {
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const titleMatches = ad.title.toLowerCase().includes(q);
    const descriptionMatches = ad.description.toLowerCase().includes(q);
    if (!titleMatches && !descriptionMatches) return false;
  }
  if (filters.city && ad.city.toLowerCase() !== filters.city.toLowerCase()) return false;
  if (filters.categoryId && ad.categoryId !== filters.categoryId) return false;
  if (filters.condition && ad.condition !== filters.condition) return false;

  const price = ad.price !== null ? Number(ad.price) : null;
  if (filters.minPrice !== undefined && (price === null || price < filters.minPrice)) return false;
  if (filters.maxPrice !== undefined && (price === null || price > filters.maxPrice)) return false;

  return true;
}

/**
 * PLATFORM-WIDE-01: Product equivalent of matchesAdFilters. Product has
 * no city or condition column (see saved-searches.validation.ts's own
 * comment on why those stay ad-only), so a saved search of type
 * 'products' that happens to carry city/condition (left over from a
 * stale client, say) simply never checks them here — same "absent/
 * inapplicable filter keys are unconstrained" semantics as the ad case.
 * `q` matches against name + description, mirroring products.repository
 * .ts's own ILIKE search branch.
 */
function matchesProductFilters(product: Product, filters: SavedSearchFilters): boolean {
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const nameMatches = product.name.toLowerCase().includes(q);
    const descriptionMatches = product.description.toLowerCase().includes(q);
    if (!nameMatches && !descriptionMatches) return false;
  }
  if (filters.categoryId && product.categoryId !== filters.categoryId) return false;

  const price = Number(product.price);
  if (filters.minPrice !== undefined && price < filters.minPrice) return false;
  if (filters.maxPrice !== undefined && price > filters.maxPrice) return false;

  return true;
}

/**
 * PLATFORM-WIDE-01: ServiceListing equivalent. `price` is nullable
 * (NEGOTIABLE pricing type has no fixed price) — a listing with no
 * price never satisfies a minPrice/maxPrice filter, same null-handling
 * as matchesAdFilters' own price check.
 */
function matchesServiceFilters(listing: ServiceListing, filters: SavedSearchFilters): boolean {
  if (filters.q) {
    const q = filters.q.toLowerCase();
    const titleMatches = listing.title.toLowerCase().includes(q);
    const descriptionMatches = listing.description.toLowerCase().includes(q);
    if (!titleMatches && !descriptionMatches) return false;
  }
  if (filters.categoryId && listing.categoryId !== filters.categoryId) return false;

  const price = listing.price !== null ? Number(listing.price) : null;
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
    // AUDIT-FIX (race conditions pass): count-then-create was
    // previously two unlocked statements — two concurrent requests
    // could both read a count one under MAX_SAVED_SEARCHES_PER_USER
    // and both insert, letting a user exceed the cap. Serialized per
    // user via withSavedSearchCreationLock (same primitive/pattern as
    // ads.service.ts's createAd and products.service.ts's
    // createProduct) so the check-and-insert is now atomic.
    return withSavedSearchCreationLock(userId, async () => {
      const count = await savedSearchesRepository.countByUserId(userId);
      if (count >= MAX_SAVED_SEARCHES_PER_USER) {
        throw new BadRequestError(
          `You have reached the maximum number of saved searches (${MAX_SAVED_SEARCHES_PER_USER}).`,
          'SAVED_SEARCH_LIMIT_REACHED',
          { maxPerUser: MAX_SAVED_SEARCHES_PER_USER }
        );
      }
      return savedSearchesRepository.create(userId, input.label, input.filters);
    });
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
 *
 * PLATFORM-WIDE-01: onProductCreated/onServiceListingCreated below
 * follow the exact same shape — load once, filter to this event's
 * type (a saved search of type 'products' is structurally never a
 * candidate for a new ad, and vice versa), exclude the actor's own
 * listing, match, notify, mark notified. Kept as three near-identical
 * functions rather than one generic entity-matcher: each already reads
 * a differently-shaped row (AdWithAuthor / ProductWithStore /
 * ServiceListingWithProvider) with its own matches*Filters function, so
 * a shared abstraction would mostly be indirection without removing
 * real duplication.
 */
export const savedSearchEvents = {
  onAdCreated: async (ad: AdWithAuthor): Promise<void> => {
    const searches = await savedSearchesRepository.findAllForMatching();
    // A seller's own saved search matching their own new ad would be a
    // confusing, useless notification ("your search matched the ad you
    // just posted") — exclude it the same way SellerCard/conversations
    // already treat "acting on your own ad" as a no-op case elsewhere.
    //
    // PLATFORM-WIDE-01: also filters to type 'ads' (or no type at all —
    // rows saved before this field existed) so a products/services
    // saved search is never even passed to matchesAdFilters.
    const candidates = searches.filter(
      (s) => s.userId !== ad.userId && savedSearchType(s) === 'ads'
    );

    const matched = candidates.filter((s) =>
      matchesAdFilters(ad, s.filters as unknown as SavedSearchFilters)
    );
    if (matched.length === 0) return;

    await notificationEvents.onSavedSearchMatched(
      matched.map((s) => ({ userId: s.userId, savedSearchId: s.id, label: s.label })),
      { type: 'ad', id: ad.id, title: ad.title }
    );
    await savedSearchesRepository.markNotified(matched.map((s) => s.id));
  },

  /** PLATFORM-WIDE-01: products.service.ts's createProduct calls this
   * after a new product is published. `ownerUserId` is passed in
   * explicitly (the acting caller in createProduct, i.e. the store
   * owner) rather than derived from a store/sellerProfile include on
   * `product` — Product itself carries no userId (it's owned by a
   * store, not directly by a user), and createProduct already has the
   * owner's userId in scope, so no extra include/query is needed just
   * to exclude their own saved searches. */
  onProductCreated: async (product: Product, ownerUserId: string): Promise<void> => {
    const searches = await savedSearchesRepository.findAllForMatching();
    const candidates = searches.filter(
      (s) => s.userId !== ownerUserId && savedSearchType(s) === 'products'
    );

    const matched = candidates.filter((s) =>
      matchesProductFilters(product, s.filters as unknown as SavedSearchFilters)
    );
    if (matched.length === 0) return;

    await notificationEvents.onSavedSearchMatched(
      matched.map((s) => ({ userId: s.userId, savedSearchId: s.id, label: s.label })),
      { type: 'product', id: product.id, title: product.name }
    );
    await savedSearchesRepository.markNotified(matched.map((s) => s.id));
  },

  /** PLATFORM-WIDE-01: service-listings.service.ts's createServiceListing
   * calls this after a new listing is published. Same ownerUserId
   * reasoning as onProductCreated above. */
  onServiceListingCreated: async (listing: ServiceListing, ownerUserId: string): Promise<void> => {
    const searches = await savedSearchesRepository.findAllForMatching();
    const candidates = searches.filter(
      (s) => s.userId !== ownerUserId && savedSearchType(s) === 'services'
    );

    const matched = candidates.filter((s) =>
      matchesServiceFilters(listing, s.filters as unknown as SavedSearchFilters)
    );
    if (matched.length === 0) return;

    await notificationEvents.onSavedSearchMatched(
      matched.map((s) => ({ userId: s.userId, savedSearchId: s.id, label: s.label })),
      { type: 'service', id: listing.id, title: listing.title }
    );
    await savedSearchesRepository.markNotified(matched.map((s) => s.id));
  },
};

/** Reads the `type` key back out of a SavedSearch row's filters JSON,
 * defaulting to 'ads' for rows saved before this field existed — same
 * default the validation schema applies on write, kept here too since
 * pre-existing DB rows were never re-validated/migrated. */
function savedSearchType(s: SavedSearch): 'ads' | 'products' | 'services' {
  const filters = s.filters as unknown as SavedSearchFilters;
  return filters.type ?? 'ads';
}

// Exported for unit tests only — not part of the module's public API
// surface used by other modules.
export const __testables__ = { matchesAdFilters, matchesProductFilters, matchesServiceFilters };
