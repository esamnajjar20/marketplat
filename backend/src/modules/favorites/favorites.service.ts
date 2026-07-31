import { favoritesRepository, FavoriteWithAd, FavoriteListRow } from './favorites.repository';
import { adsService } from '../ads/ads.service'; // A-01: use service facade, not repository
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
};
