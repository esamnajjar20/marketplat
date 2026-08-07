import { prisma } from '../../config/prisma';
import { getPaginationParams } from '../../shared/utils/pagination';
import { Prisma } from '@prisma/client';
import { GetFavoritesQuery } from './favorites.validation';

export type FavoriteWithAd = Prisma.FavoriteGetPayload<{
  include: {
    ad: {
      include: {
        user: { select: { id: true; name: true; city: true; avatarUrl: true } };
        category: { select: { id: true; name: true; nameAr: true } };
      };
    };
  };
}>;

const favoriteWithAd = {
  ad: {
    include: {
      user: { select: { id: true, name: true, city: true, avatarUrl: true } },
      category: { select: { id: true, name: true, nameAr: true } },
    },
  },
} as const;

// PERF FIX (same class of issue as ads.repository.ts's AdListRow): the
// GET /favorites list previously included the full nested `ad` via
// `include`, which adds relations but doesn't restrict Ad's own scalar
// columns — so each favorited ad's full `description` text was
// serialized on every page of the favorites list, even though the
// frontend's FavoriteRecord.ad is typed as AdListItem (Omit<Ad,
// 'description'>) and never reads it. `create` (used only by
// toggleFavorite, whose result the service never returns to the client)
// is left on the original include-based shape, since narrowing it would
// change no observable behavior today but would make its result type
// silently diverge from FavoriteWithAd for any future caller that does
// start using it.
export type FavoriteListRow = Omit<FavoriteWithAd, 'ad'> & {
  ad: Omit<FavoriteWithAd['ad'], 'description'>;
};

const favoriteListSelect = {
  id: true,
  userId: true,
  adId: true,
  createdAt: true,
  ad: {
    select: {
      id: true,
      title: true,
      price: true,
      images: true,
      city: true,
      condition: true,
      isNegotiable: true,
      status: true,
      views: true,
      // See ads.repository.ts's adListSelect for why this is here —
      // same reasoning: FavoriteListRow's `ad` type derives from
      // FavoriteWithAd (a full-model `include`, not `select`), so it
      // requires every Ad scalar including this one, even though the
      // favorites list UI doesn't read it.
      viewsAtLastReport: true,
      isFeatured: true,
      isPinned: true,
      // Fraud detection (item 12): same reasoning as viewsAtLastReport
      // above — added the moment these two columns landed on Ad.
      riskScore: true,
      flaggedForReview: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      categoryId: true,
      sellerProfileId: true,
      user: { select: { id: true, name: true, city: true, avatarUrl: true } },
      category: { select: { id: true, name: true, nameAr: true } },
    },
  },
} as const;

export const favoritesRepository = {
  findByUserAndAd: async (userId: string, adId: string) =>
    prisma.favorite.findUnique({ where: { userId_adId: { userId, adId } } }),

  create: async (userId: string, adId: string): Promise<FavoriteWithAd> =>
    prisma.favorite.create({ data: { userId, adId }, include: favoriteWithAd }),

  delete: async (userId: string, adId: string): Promise<void> => {
    await prisma.favorite.delete({ where: { userId_adId: { userId, adId } } });
  },

  // FIX FAV-01 (plan's "favorites deleted ads" item): findManyByUserId
  // previously filtered only by `{ userId }`, with no check on the
  // linked Ad's status — toggleFavorite/findAdForReference already
  // block favoriting an ad that's ALREADY deleted (adsService's own
  // findAdForReference), but that guard only fires at favorite-creation
  // time. If an ad you favorited earlier gets deleted afterward, the
  // Favorite row itself is untouched (no cascade/cleanup on Ad status
  // changes), so it kept showing up here indefinitely — a dead ad
  // sitting in "المفضلة" the user can never act on. Excluding
  // ad.status: 'DELETED' at the query level (not filtered client-side
  // after the fact) means both the returned rows AND the pagination
  // total/count are correct together.
  findManyByUserId: async (
    userId: string,
    query: GetFavoritesQuery
  ): Promise<{ favorites: FavoriteListRow[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit); // A-06
    const where: Prisma.FavoriteWhereInput = { userId, ad: { status: { not: 'DELETED' } } };

    // D-05: read-only batch — Promise.all is sufficient, no transaction needed
    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where,
        select: favoriteListSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.favorite.count({ where }),
    ]);

    return { favorites, total };
  },

  /** Epic 6: every user who favorited this ad — used only to fan out
   * FAV_AD_PRICE_CHANGED notifications on a price update
   * (ads.service.ts's updateAd). Intentionally returns just userIds,
   * not full Favorite rows — the caller has no other use for them. */
  findUserIdsByAdId: async (adId: string): Promise<string[]> => {
    const favorites = await prisma.favorite.findMany({
      where: { adId },
      select: { userId: true },
    });
    return favorites.map((f) => f.userId);
  },
};
