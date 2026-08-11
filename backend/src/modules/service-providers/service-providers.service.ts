import { prisma } from '../../config/prisma';
import { ServiceProviderDetails, ServiceListing } from '@prisma/client';
import {
  serviceProvidersRepository,
  ServiceProviderWithSeller,
  NearbyServiceProviderRow,
} from './service-providers.repository';
import { serviceListingsRepository } from '../service-listings/service-listings.repository';
import {
  CreateServiceProviderInput,
  UpdateServiceProviderInput,
  NearbyServiceProvidersQuery,
} from './service-providers.validation';
import { ConflictError } from '../../shared/errors/ConflictError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { sellersRepository } from '../sellers/sellers.repository';
import { withServiceProviderCreationLock } from '../../shared/utils/serviceProviderLock';
import { getPaginationParams, PaginationMeta, buildPaginationMeta } from '../../shared/utils/pagination';

export const serviceProvidersService = {
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
    const { listings } = await serviceListingsRepository.findManyByProviderId(id, {
      status: 'ACTIVE',
      limit: 100,
    });
    return { ...details, listings };
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
