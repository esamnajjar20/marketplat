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
      isFeatured: true,
      isPinned: true,
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

  findManyByUserId: async (
    userId: string,
    query: GetFavoritesQuery
  ): Promise<{ favorites: FavoriteListRow[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit); // A-06
    const where: Prisma.FavoriteWhereInput = { userId };

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
};
