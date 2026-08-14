import { favoritesRepository, FavoriteWithAd, FavoriteListRow } from './favorites.repository';
import { adsService } from '../ads/ads.service'; // A-01: use service facade, not repository
import { activityService, activityTemplates } from '../activity';
import { GetFavoritesQuery } from './favorites.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { Prisma } from '@prisma/client';

const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

export const favoritesService = {
  toggleFavorite: async (
    userId: string,
    adId: string
  ): Promise<{ action: 'added' | 'removed' }> => {
    const ad = await adsService.findAdForReference(adId);
    if (!ad) throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');

    const existing = await favoritesRepository.findByUserAndAd(userId, adId);
    if (existing) {
      try {
        await favoritesRepository.delete(userId, adId);
      } catch (err) {
        // CONCURRENCY-FIX: another concurrent toggle already deleted this
        // favorite (P2025 = record not found). Treat as a successful no-op
        // rather than surfacing a 500 for a benign race.
        if (!isPrismaError(err, 'P2025')) throw err;
      }
      // Gap #10: fire-and-forget, see activityService.record()'s own
      // doc comment.
      activityService.record({ userId, ...activityTemplates.favoriteRemoved(ad.id, ad.title) });
      return { action: 'removed' };
    }

    try {
      await favoritesRepository.create(userId, adId);
    } catch (err) {
      // CONCURRENCY-FIX: another concurrent toggle already created this
      // favorite (P2002 = unique constraint violation on userId_adId).
      // Treat as a successful no-op instead of a 500.
      if (!isPrismaError(err, 'P2002')) throw err;
    }
    // Gap #10: fire-and-forget, see activityService.record()'s own doc
    // comment.
    activityService.record({ userId, ...activityTemplates.favoriteAdded(ad.id, ad.title) });
    return { action: 'added' };
  },

  getMyFavorites: async (
    userId: string,
    query: GetFavoritesQuery
  ): Promise<PaginatedResult<FavoriteListRow>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { favorites, total } = await favoritesRepository.findManyByUserId(userId, query);
    return { items: favorites, meta: buildPaginationMeta(total, page, limit) };
  },

  // UX-FIX (frontend audit P2-03): AdDetailSection.tsx previously called
  // GET /favorites?limit=100 (the endpoint's max page size) on every ad
  // detail view just to derive one boolean — whether *this* ad is
  // favorited — and was silently wrong for any user with >100
  // favorites, since the ad in question could sit past the cap. Reuses
  // the same findByUserAndAd() the toggle endpoint already calls
  // internally — no new query, just a new thin route onto existing,
  // exercised repository code.
  isFavorited: async (userId: string, adId: string): Promise<boolean> => {
    const favorite = await favoritesRepository.findByUserAndAd(userId, adId);
    return favorite !== null;
  },
};
