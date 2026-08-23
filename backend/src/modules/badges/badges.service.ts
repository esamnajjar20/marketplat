import { storesRepository, StoreWithSellerAndCounts } from '../stores/stores.repository';
import { storeReviewsRepository } from '../stores/store-reviews.repository';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { Badge, computeBadges } from './badges.types';

const toBadgeInput = (
  store: StoreWithSellerAndCounts,
  rating: { avg: number | null; count: number }
) => ({
  createdAt: store.createdAt,
  views: store.views,
  followerCount: store._count.followers,
  sellerVerified: store.sellerProfile.verificationStatus === 'VERIFIED',
  avgRating: rating.avg,
  reviewCount: rating.count,
});

export const badgesService = {
  // Same id-then-slug fallback as collections.service.ts's
  // getPublicCollections — deliberately not routed through
  // storesService.getPublicStore to avoid its incrementViews
  // side-effect firing a second time for a request that's only asking
  // for badges, not rendering the store page.
  getStoreBadges: async (storeIdOrSlug: string): Promise<Badge[]> => {
    const store =
      (await storesRepository.findPublicById(storeIdOrSlug)) ??
      (await storesRepository.findPublicBySlug(storeIdOrSlug));
    if (!store || store.status !== 'ACTIVE') {
      throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    }
    const rating = await storeReviewsRepository.getRatingSummary(store.sellerProfileId);
    return computeBadges(toBadgeInput(store, rating));
  },

  // Batch variant — one grouped rating query for the whole page
  // instead of one per store. Takes already-fetched stores (list/
  // search endpoints already query StoreDetails with sellerProfile +
  // counts included) rather than re-fetching, so this stays a pure
  // "add badges to what you already have" step.
  getBadgesForStores: async (
    stores: StoreWithSellerAndCounts[]
  ): Promise<Map<string, Badge[]>> => {
    const ratings = await storeReviewsRepository.getRatingSummaries(
      stores.map(s => s.sellerProfileId)
    );
    return new Map(
      stores.map(store => [
        store.id,
        computeBadges(toBadgeInput(store, ratings.get(store.sellerProfileId) ?? { avg: null, count: 0 })),
      ])
    );
  },
};
