import { SavedSearch, Product, ServiceListing } from '@prisma/client';
import { savedSearchesRepository } from './saved-searches.repository';
import { notificationEvents } from '../notifications';
import { BadRequestError } from '../../../shared/errors/BadRequestError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { withSavedSearchCreationLock } from '../../../shared/locks/adLock';
import { matchesSearchQuery } from '../../../shared/search/searchTextMatch';
import type { CreateSavedSearchInput, SavedSearchFilters } from './saved-searches.validation';
import type { AdWithAuthor } from '../../classifieds/ads/ads.repository';

// Mirrors env.ads.maxPerUser's role for the ads module — a plain
// constant rather than a new env var, since this doesn't need to be
// ops-tunable the way ad-posting limits are; it's just a sane ceiling
// against one user accumulating hundreds of stored filter sets.
const MAX_SAVED_SEARCHES_PER_USER = 20;

/**
 * True if `ad` satisfies every criterion present in `filters`. Absent
 * filter keys are unconstrained (match any value) — same semantics as
 * GET /ads's optional query params. `q` matches via matchesSearchQuery
 * (searchTextMatch.ts) — the JS-side counterpart to the arabic_normalize
 * + to_tsvector/plainto_tsquery matching GET /ads?search= actually runs
 * in Postgres, checked against both title and description. See that
 * file's header for exactly which equivalence classes this folds
 * (Arabic letter-shape variants, diacritics, tatweel) and why matching
 * is AND-of-words rather than a literal whole-phrase substring.
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
 *
 * AUDIT-FIX (saved-search q matching): `q` matching was previously a
 * literal, case-folded-only substring check — no Arabic letter-shape
 * normalization (أ/إ/آ/ٱ/ى typed differently from how the ad was
 * originally typed silently missed a real match) and whole-phrase-only
 * (a 2-word saved search like "toyota camry" never matched an ad
 * titled "camry toyota 2020", or one where the words landed one in the
 * title and one in the description). Replaced with matchesSearchQuery
 * so `q` behaves the same way GET /ads?search= already does, instead
 * of a stricter, literal-only rule unique to saved searches.
 */
export function matchesAdFilters(ad: AdWithAuthor, filters: SavedSearchFilters): boolean {
  if (filters.q && !matchesSearchQuery([ad.title, ad.description], filters.q)) return false;
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
 * `q` matches via matchesSearchQuery (searchTextMatch.ts) against
 * name + description — see matchesAdFilters' doc comment above for why
 * (Arabic letter-shape/diacritic normalization, AND-of-words instead
 * of literal whole-phrase substring). Note this makes saved-search `q`
 * matching for products *smarter* than products.repository.ts's own
 * live `search` param, which still does plain `contains` — a separate,
 * pre-existing gap in the main product search, not introduced here.
 */
function matchesProductFilters(product: Product, filters: SavedSearchFilters): boolean {
  if (filters.q && !matchesSearchQuery([product.name, product.description], filters.q))
    return false;
  if (filters.categoryId && product.categoryId !== filters.categoryId) return false;

  const price = Number(product.price);
  if (filters.minPrice !== undefined && price < filters.minPrice) return false;
  if (filters.maxPrice !== undefined && price > filters.maxPrice) return false;

  return true;
}

/**
 * PLATFORM-WIDE-01: ServiceListing equivalent. `price` is nullable
 * (NEGOTIABLE pricing type has no price) — a listing with no
 * price never satisfies a minPrice/maxPrice filter, same null-handling
 * as matchesAdFilters' own price check. `q` matches via
 * matchesSearchQuery (searchTextMatch.ts) — same note as
 * matchesProductFilters above re: this being smarter than
 * service-listings.repository.ts's own live `search` param.
 */
function matchesServiceFilters(listing: ServiceListing, filters: SavedSearchFilters): boolean {
  if (filters.q && !matchesSearchQuery([listing.title, listing.description], filters.q))
    return false;
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
 * Event-triggered matcher — called after a new ad/product/service listing is
 * published. Search rules remain in Node for clarity, while the repository
 * streams saved searches in stable, bounded pages so platform growth cannot
 * truncate matching or materialize the full search table in memory.
 */
export const savedSearchEvents = {
  onAdCreated: async (ad: AdWithAuthor): Promise<void> => {
    const snapshotAt = new Date();
    for await (const searches of savedSearchesRepository.iterateAllForMatching(snapshotAt)) {
      const matched = searches.filter(
        search =>
          search.userId !== ad.userId &&
          savedSearchType(search) === 'ads' &&
          matchesAdFilters(ad, search.filters as unknown as SavedSearchFilters)
      );
      if (matched.length === 0) continue;

      const ids = matched.map(search => search.id);
      await notificationEvents.onSavedSearchMatched(
        matched.map(search => ({ userId: search.userId, savedSearchId: search.id, label: search.label })),
        { type: 'ad', id: ad.id, title: ad.title }
      );
      await savedSearchesRepository.markNotified(ids);
    }
  },

  /** The owner is excluded, and only product searches are evaluated. */
  onProductCreated: async (product: Product, ownerUserId: string): Promise<void> => {
    const snapshotAt = new Date();
    for await (const searches of savedSearchesRepository.iterateAllForMatching(snapshotAt)) {
      const matched = searches.filter(
        search =>
          search.userId !== ownerUserId &&
          savedSearchType(search) === 'products' &&
          matchesProductFilters(product, search.filters as unknown as SavedSearchFilters)
      );
      if (matched.length === 0) continue;

      const ids = matched.map(search => search.id);
      await notificationEvents.onSavedSearchMatched(
        matched.map(search => ({ userId: search.userId, savedSearchId: search.id, label: search.label })),
        { type: 'product', id: product.id, title: product.name }
      );
      await savedSearchesRepository.markNotified(ids);
    }
  },

  /** Only service searches are evaluated for a newly published service listing. */
  onServiceListingCreated: async (listing: ServiceListing, ownerUserId: string): Promise<void> => {
    const snapshotAt = new Date();
    for await (const searches of savedSearchesRepository.iterateAllForMatching(snapshotAt)) {
      const matched = searches.filter(
        search =>
          search.userId !== ownerUserId &&
          savedSearchType(search) === 'services' &&
          matchesServiceFilters(listing, search.filters as unknown as SavedSearchFilters)
      );
      if (matched.length === 0) continue;

      const ids = matched.map(search => search.id);
      await notificationEvents.onSavedSearchMatched(
        matched.map(search => ({ userId: search.userId, savedSearchId: search.id, label: search.label })),
        { type: 'service', id: listing.id, title: listing.title }
      );
      await savedSearchesRepository.markNotified(ids);
    }
  },
};

/** Reads the `type` key back out of a SavedSearch row's filters JSON,
 * defaulting to 'ads' for rows saved before this field existed — same
 * default the validation schema applies on write, kept here too since
 * pre-existing DB rows were never re-validated/migrated. */
export function savedSearchType(s: SavedSearch): 'ads' | 'products' | 'services' {
  const filters = s.filters as unknown as SavedSearchFilters;
  return filters.type ?? 'ads';
}

// Exported for unit tests only — not part of the module's public API
// surface used by other modules.
export const __testables__ = { matchesAdFilters, matchesProductFilters, matchesServiceFilters };
