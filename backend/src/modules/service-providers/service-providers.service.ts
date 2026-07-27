import { prisma } from '../../config/prisma';
import { ServiceProviderDetails } from '@prisma/client';
import {
  serviceProvidersRepository,
  ServiceProviderWithSeller,
  NearbyServiceProviderRow,
} from './service-providers.repository';
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
      throw new ForbiddenError('Your seller account has been suspended.');
    }

    // Unlocked pre-check: cheap fast-fail before taking the lock, mirroring
    // sellersService.createSellerProfile's own pattern.
    const existing = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
    if (existing) {
      throw new ConflictError('You already have a service provider profile.');
    }

    return withServiceProviderCreationLock(sellerProfile.id, async () => {
      const stillExisting = await serviceProvidersRepository.findBySellerProfileId(
        sellerProfile.id
      );
      if (stillExisting) {
        throw new ConflictError('You already have a service provider profile.');
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
          throw new ConflictError('You already have a service provider profile.');
        }
        throw error;
      }
    });
  },

  getMyServiceProvider: async (userId: string): Promise<ServiceProviderDetails> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) throw new NotFoundError('Seller profile not found');

    const details = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
    if (!details) throw new NotFoundError('Service provider profile not found');
    return details;
  },

  updateMyServiceProvider: async (
    userId: string,
    input: UpdateServiceProviderInput
  ): Promise<ServiceProviderDetails> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) throw new NotFoundError('Seller profile not found');

    const details = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
    if (!details) throw new NotFoundError('Service provider profile not found');

    return serviceProvidersRepository.update(details.id, input);
  },

  getPublicServiceProvider: async (id: string): Promise<ServiceProviderWithSeller> => {
    const details = await serviceProvidersRepository.findPublicById(id);
    if (!details) throw new NotFoundError('Service provider not found');
    return details;
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
