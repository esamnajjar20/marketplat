import { storesRepository, StoreWithSellerAndCounts } from '../../commerce/stores/stores.repository';
import { storeReviewsRepository } from '../../commerce/stores/store-reviews.repository';
import { serviceProvidersRepository } from '../../services/service-providers/service-providers.repository';
import { serviceListingsRepository } from '../../services/service-listings/service-listings.repository';
import { serviceReviewsRepository } from '../../services/service-reviews/service-reviews.repository';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { Badge, computeBadges, ProviderBadge, computeProviderBadges } from './badges.types';

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

// Compute badges from an already-fetched public store row. Store page
// aggregation uses this to avoid fetching the same store a second time.
const getStoreBadgesForRecord = async (store: StoreWithSellerAndCounts): Promise<Badge[]> => {
  const rating = await storeReviewsRepository.getRatingSummary(store.sellerProfileId);
  return computeBadges(toBadgeInput(store, rating));
};

export const badgesService = {
  getStoreBadgesForRecord,

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
    return getStoreBadgesForRecord(store);
  },

  // Batch variant — one grouped rating query for the whole page
  // instead of one per store. Takes already-fetched stores (list/
  // search endpoints already query StoreDetails with sellerProfile +
  // counts included) rather than re-fetching, so this stays a pure
  // "add badges to what you already have" step.
  getBadgesForStores: async (stores: StoreWithSellerAndCounts[]): Promise<Map<string, Badge[]>> => {
    const ratings = await storeReviewsRepository.getRatingSummaries(
      stores.map(s => s.sellerProfileId)
    );
    return new Map(
      stores.map(store => [
        store.id,
        computeBadges(
          toBadgeInput(store, ratings.get(store.sellerProfileId) ?? { avg: null, count: 0 })
        ),
      ])
    );
  },

  // PROVIDER-BADGES: same public, no-auth, entirely-derived shape as
  // getStoreBadges above — a provider's badges are part of its public
  // page, same visibility as its rating.
  getProviderBadges: async (providerId: string): Promise<ProviderBadge[]> => {
    const provider = await serviceProvidersRepository.findPublicById(providerId);
    if (!provider || provider.sellerProfile.suspended) {
      throw new NotFoundError('Service provider not found', 'SERVICE_PROVIDER_NOT_FOUND');
    }
    const [listingStats, rating] = await Promise.all([
      serviceListingsRepository.getStatsByProviderId(provider.id),
      serviceReviewsRepository.getRatingSummary(provider.sellerProfileId),
    ]);
    return computeProviderBadges({
      createdAt: provider.createdAt,
      totalViews: listingStats.totalViews,
      completedRequestsCount: provider.completedRequestsCount,
      sellerVerified: provider.sellerProfile.verified,
      avgRating: rating.avg,
      reviewCount: rating.count,
    });
  },
};
