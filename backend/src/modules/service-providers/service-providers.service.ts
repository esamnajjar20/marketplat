import { prisma } from '../../config/prisma';
import { ServiceProviderDetails, ServiceListing } from '@prisma/client';
import { uploadServiceProviderLogo, deleteImage } from '../../config/cloudinary';
import { extractCloudinaryPublicId, cleanupUploadedImages } from '../../shared/utils/cloudinaryHelpers';
import {
  serviceProvidersRepository,
  ServiceProviderWithSeller,
  NearbyServiceProviderRow,
} from './service-providers.repository';
import { serviceListingsRepository } from '../service-listings/service-listings.repository';
import { serviceRequestsRepository } from '../service-requests/service-requests.repository';
import { appointmentsRepository } from '../appointments/appointments.repository';
import { serviceReviewsRepository } from '../service-reviews/service-reviews.repository';
import {
  CreateServiceProviderInput,
  UpdateServiceProviderInput,
  NearbyServiceProvidersQuery,
  GetServiceProvidersQuery,
} from './service-providers.validation';
import { ConflictError } from '../../shared/errors/ConflictError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { sellersRepository } from '../sellers/sellers.repository';
import { withServiceProviderCreationLock } from '../../shared/utils/serviceProviderLock';
import { getPaginationParams, PaginationMeta, buildPaginationMeta } from '../../shared/utils/pagination';

// ANALYTICS: mirrors stores.service.ts's StoreAnalytics shape (same
// "views / pipeline counts / top items" structure) adapted to what a
// provider actually has instead of a store's followers/promotions —
// pendingRequests/upcomingAppointments are the provider's equivalent
// of "things needing my attention", revenue is real here (unlike
// StoreAnalytics, which omits it for lack of an Order model) since
// ServiceRequest.agreedPrice already exists.
export interface ServiceProviderAnalytics {
  totalViews: number;
  activeListings: number;
  pendingRequests: number;
  completedRequests: number;
  fulfillmentRate: number | null;
  upcomingAppointments: number;
  averageRating: number | null;
  reviewCount: number;
  revenue: number;
  topListings: { id: string; title: string; views: number; image: string | null }[];
}

export const serviceProvidersService = {
  // ANALYTICS: same requireOwnStore-style ownership resolution as
  // stores.service.ts's getMyStoreAnalytics — userId -> sellerProfile
  // -> provider, 404 at either hop if either doesn't exist yet (a user
  // with no provider profile has no analytics to show, same "go
  // create one first" gap MyStoreAnalytics.tsx's own 404 branch
  // already handles for stores).
  getMyServiceProviderAnalytics: async (userId: string): Promise<ServiceProviderAnalytics> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');

    const provider = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
    if (!provider) throw new NotFoundError('Service provider profile not found', 'SERVICE_PROVIDER_NOT_FOUND');

    const [listingStats, topListings, pendingRequests, terminalStats, revenue, upcomingAppointments, rating] =
      await Promise.all([
        serviceListingsRepository.getStatsByProviderId(provider.id),
        serviceListingsRepository.findTopByProviderId(provider.id, 5),
        serviceRequestsRepository.countPendingByProviderId(provider.id),
        serviceRequestsRepository.countTerminalStatsByProviderId(provider.id),
        serviceRequestsRepository.sumRevenueByProviderId(provider.id),
        appointmentsRepository.countUpcomingByProviderId(provider.id),
        serviceReviewsRepository.getRatingSummary(sellerProfile.id),
      ]);

    const totalTerminal = terminalStats.completed + terminalStats.cancelledOrRejected;

    return {
      totalViews: listingStats.totalViews,
      activeListings: listingStats.activeCount,
      pendingRequests,
      completedRequests: terminalStats.completed,
      fulfillmentRate:
        totalTerminal > 0 ? Math.round((terminalStats.completed / totalTerminal) * 10000) / 100 : null,
      upcomingAppointments,
      averageRating: rating.avg,
      reviewCount: rating.count,
      revenue,
      topListings: topListings.map(listing => ({
        id: listing.id,
        title: listing.title,
        views: listing.views,
        image: listing.images[0] ?? null,
      })),
    };
  },


  // services-design.md §1: ServiceProviderDetails is built on top of an
  // existing SellerProfile, never created independently of one — the
  // same "eligibility gate" SellerProfile itself already enforces
  // (email verified, agreed to terms) is inherited for free, so no
  // separate service-specific onboarding check is added here (§16).
  createServiceProvider: async (
    userId: string,
    input: CreateServiceProviderInput
  ): Promise<ServiceProviderDetails> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) {
      throw new BadRequestError(
        'You need a seller profile before becoming a service provider.'
      );
    }
    // AUDIT-FIX: same suspension gate as service-listings.service.ts's
    // requireOwnProvider and sellersService.ensureSellerProfileForAdCreation.
    if (sellerProfile.suspended) {
      throw new ForbiddenError('Your seller account has been suspended.', 'SELLER_SUSPENDED');
    }

    // Unlocked pre-check: cheap fast-fail before taking the lock, mirroring
    // sellersService.createSellerProfile's own pattern.
    const existing = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
    if (existing) {
      throw new ConflictError('You already have a service provider profile.', 'SERVICE_PROVIDER_ALREADY_EXISTS');
    }

    return withServiceProviderCreationLock(sellerProfile.id, async () => {
      const stillExisting = await serviceProvidersRepository.findBySellerProfileId(
        sellerProfile.id
      );
      if (stillExisting) {
        throw new ConflictError('You already have a service provider profile.', 'SERVICE_PROVIDER_ALREADY_EXISTS');
      }

      try {
        return await prisma.$transaction(async tx =>
          serviceProvidersRepository.create(tx, sellerProfile.id, {
            businessName: input.businessName,
            businessType: input.businessType,
            logoUrl: input.logoUrl,
            description: input.description,
            serviceAreaCities: input.serviceAreaCities,
            workingHours: input.workingHours,
            contactPhone: input.contactPhone,
            latitude: input.latitude,
            longitude: input.longitude,
          })
        );
      } catch (error: any) {
        // Belt-and-suspenders against the same TOCTOU edge case
        // sellersService guards against — the DB's @unique on
        // sellerProfileId is the last line of defense.
        if (error?.code === 'P2002') {
          throw new ConflictError('You already have a service provider profile.', 'SERVICE_PROVIDER_ALREADY_EXISTS');
        }
        throw error;
      }
    });
  },

  getMyServiceProvider: async (userId: string): Promise<ServiceProviderDetails> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');

    const details = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
    if (!details) throw new NotFoundError('Service provider profile not found', 'SERVICE_PROVIDER_NOT_FOUND');
    return details;
  },

  updateMyServiceProvider: async (
    userId: string,
    input: UpdateServiceProviderInput
  ): Promise<ServiceProviderDetails> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');

    const details = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
    if (!details) throw new NotFoundError('Service provider profile not found', 'SERVICE_PROVIDER_NOT_FOUND');

    return serviceProvidersRepository.update(details.id, input);
  },

  // Feature-completeness fix: logoUrl was fully supported end-to-end
  // (validated, stored, rendered in ServiceProviderHeader/Card) but had
  // no upload path — the only way to set it was a hand-crafted PATCH
  // with an already-hosted URL. Mirrors storesService.uploadLogo and,
  // one module further back, usersService.uploadAvatar exactly: upload
  // first, persist the URL, clean up whichever side fails.
  uploadLogo: async (userId: string, file: Express.Multer.File): Promise<ServiceProviderDetails> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) throw new NotFoundError('Seller profile not found', 'SELLER_NOT_FOUND');

    const details = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
    if (!details) throw new NotFoundError('Service provider profile not found', 'SERVICE_PROVIDER_NOT_FOUND');

    const { url, publicId } = await uploadServiceProviderLogo(file.buffer);

    try {
      const updated = await serviceProvidersRepository.update(details.id, { logoUrl: url });
      if (details.logoUrl) {
        const oldPublicId = extractCloudinaryPublicId(details.logoUrl);
        if (oldPublicId) await deleteImage(oldPublicId).catch(() => undefined);
      }
      return updated;
    } catch (error) {
      await cleanupUploadedImages([publicId]);
      throw error;
    }
  },

  // BUG FIX: findPublicById only ever fetched the provider row +
  // sellerProfile — never `listings`, even though the frontend's
  // ServiceProviderPublic type (types/service.types.ts) and
  // ServiceProviderListings component have always expected a
  // `listings` array on this response. That mismatch surfaced as a
  // runtime crash on /service-providers/[id] ("Cannot read properties
  // of undefined (reading 'filter')") rather than a compile-time
  // error, since this function's own return type never claimed to
  // include listings in the first place.
  //
  // Only ACTIVE listings are attached — this is the public provider
  // page, so PAUSED/DELETED listings a provider is still managing
  // privately (see getMyServiceListings) have no reason to reach an
  // anonymous visitor. limit: 100 avoids an unbounded fetch for a
  // provider with an unusually large catalog while still comfortably
  // covering the normal case; a provider with more active listings
  // than that is a pagination feature to add later, not a case to
  // silently truncate without any signal today.
  getPublicServiceProvider: async (
    id: string
  ): Promise<ServiceProviderWithSeller & { listings: ServiceListing[] }> => {
    const details = await serviceProvidersRepository.findPublicById(id);
    if (!details) throw new NotFoundError('Service provider not found', 'SERVICE_PROVIDER_NOT_FOUND');
    // SEC-FIX: same gap products.service.ts's getProductById already
    // closed for suspended-seller products, now also closed on
    // stores.service.ts's getPublicStore — findMany/findNearby above
    // both exclude a suspended seller's provider from every discovery
    // path, but this direct-by-id lookup didn't, so admin-suspending a
    // seller (the only moderation lever this feature has) left their
    // provider page fully live at its direct URL. Treated as 404, same
    // as the other two fixes.
    if (details.sellerProfile.suspended) {
      throw new NotFoundError('Service provider not found', 'SERVICE_PROVIDER_NOT_FOUND');
    }
    const { listings } = await serviceListingsRepository.findManyByProviderId(id, {
      status: 'ACTIVE',
      limit: 100,
    });
    return { ...details, listings };
  },

  // Home discovery plan (Phase 1): public city/browse list — thin
  // wrapper mirroring storesService.getStores/productsService.getProducts.
  getServiceProviders: async (
    query: GetServiceProvidersQuery
  ): Promise<{ providers: ServiceProviderDetails[]; meta: PaginationMeta }> => {
    const { page, limit, skip, take } = getPaginationParams(query.page, query.limit);
    const { rows, total } = await serviceProvidersRepository.findMany(query, skip, take);
    return { providers: rows, meta: buildPaginationMeta(total, page, limit) };
  },

  findNearby: async (
    query: NearbyServiceProvidersQuery
  ): Promise<{ providers: NearbyServiceProviderRow[]; meta: PaginationMeta }> => {
    const { page, limit, skip, take } = getPaginationParams(query.page, query.limit);
    const { rows, total } = await serviceProvidersRepository.findNearby(
      query.lat,
      query.lng,
      query.radius,
      skip,
      take
    );
    return { providers: rows, meta: buildPaginationMeta(total, page, limit) };
  },

  // AUDIT-FIX (#8/#10): this helper was written but never called from
  // anywhere (service-listings.service.ts used the simpler
  // requireOwnProvider, which didn't check availabilityStatus — see
  // createServiceListing there for the fix). Rather than wire up this
  // second, slightly-diverging copy (which duplicates sellerProfile
  // lookup + suspension logic already centralized in
  // service-listings.service.ts's requireOwnProvider), the availability
  // check was inlined at the one real call site and this dead duplicate
  // removed to avoid two authorization implementations drifting apart
  // over time.
};
