import { serviceListingsRepository, ServiceListingWithProvider } from './service-listings.repository';
import { NotFoundError } from '../../shared/errors/NotFoundError';

export interface ServiceListingMatch extends ServiceListingWithProvider {
  matchScore: number;
  matchReasons: string[];
}

/**
 * Finds alternative listings that can satisfy the same service need.
 * Matching is deliberately deterministic and cheap: service type is the
 * strongest signal, category the next, then city coverage and provider trust.
 * It is not a second recommendation engine.
 */
export const serviceListingMatchesService = {
  getMatches: async (listingId: string, limit = 8): Promise<ServiceListingMatch[]> => {
    const source = await serviceListingsRepository.findPublicById(listingId);
    if (!source || source.status === 'DELETED' || source.provider.sellerProfile.suspended) {
      throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
    }

    const candidates = await serviceListingsRepository.findMany({
      serviceTypeId: source.serviceTypeId,
      city: source.provider.serviceAreaCities[0],
      limit: Math.min(Math.max(limit * 3, 12), 40),
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });

    const sourceCategory = source.categoryId;
    const sourceCity = source.provider.serviceAreaCities[0] ?? null;
    return candidates.listings
      .filter((candidate) => candidate.id !== source.id && candidate.providerId !== source.providerId)
      .map((candidate) => {
        let score = 50;
        const reasons: string[] = ['نفس مجال الخدمة'];
        if (candidate.categoryId === sourceCategory) {
          score += 30;
          reasons.unshift('نفس التخصص');
        }
        if (sourceCity && candidate.provider.serviceAreaCities.includes(sourceCity)) {
          score += 10;
          reasons.push('يخدم نفس المدينة');
        }
        if (candidate.provider.sellerProfile.verified) {
          score += 5;
          reasons.push('مقدم خدمة موثق');
        }
        const rating = Number(candidate.provider.sellerProfile.averageRating ?? 0);
        if (rating >= 4.5) score += 5;
        return { ...candidate, matchScore: score, matchReasons: reasons };
      })
      .sort((a, b) => b.matchScore - a.matchScore || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  },
};
