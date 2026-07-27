import { prisma } from '../../config/prisma';
import { ServiceListing } from '@prisma/client';
import {
  serviceListingsRepository,
  ServiceListingWithProvider,
} from './service-listings.repository';
import {
  CreateServiceListingInput,
  UpdateServiceListingInput,
  GetServiceListingsQuery,
} from './service-listings.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { uploadImage, deleteImage } from '../../config/cloudinary';
import { extractCloudinaryPublicId, cleanupUploadedImages } from '../../shared/utils/cloudinaryHelpers';
import { serviceProvidersRepository } from '../service-providers/service-providers.repository';
import { serviceCategoriesRepository } from '../service-categories/service-categories.repository';
import { sellersRepository } from '../sellers/sellers.repository';

const MAX_LISTING_IMAGES = 10; // same cap as ads.images (env.ads.maxImagesPerAd's sibling)

// Resolves and authorizes "this user's own service provider profile" —
// the entry point every write in this module goes through first, same
// role ads.service.ts's inline ownership checks play, just centralized
// here since every mutation in this module needs it.
const requireOwnProvider = async (userId: string) => {
  const sellerProfile = await sellersRepository.findByUserId(userId);
  if (!sellerProfile) throw new BadRequestError('You need a seller profile first.');

  // AUDIT-FIX: a suspended seller (admin action) must not be able to
  // create/edit/delete service listings — mirrors the same check in
  // sellersService.ensureSellerProfileForAdCreation for the ads side.
  if (sellerProfile.suspended) {
    throw new ForbiddenError('Your seller account has been suspended.');
  }

  const provider = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
  if (!provider) {
    throw new BadRequestError('You need to create your service provider profile first.');
  }
  return provider;
};

export const serviceListingsService = {
  createServiceListing: async (
    userId: string,
    input: CreateServiceListingInput,
    files: Express.Multer.File[]
  ): Promise<ServiceListing> => {
    const provider = await requireOwnProvider(userId);

    // AUDIT-FIX (#8/#10): createServiceListing previously used the
    // generic requireOwnProvider (ownership + suspension only) and never
    // checked availabilityStatus, even though service-providers.service.ts
    // already had a dedicated ensureServiceProviderForListingCreation
    // helper written for exactly this call site — it was just never wired
    // up. A provider who has explicitly marked themselves UNAVAILABLE (as
    // opposed to merely BUSY) shouldn't be able to publish *new* listings;
    // this only gates creation, not editing/deleting existing listings,
    // since a provider going unavailable shouldn't lose the ability to
    // manage what they've already published.
    if (provider.availabilityStatus === 'UNAVAILABLE') {
      throw new ForbiddenError(
        'Your profile is marked unavailable — update it before publishing new listings.'
      );
    }

    const category = await serviceCategoriesRepository.findById(input.categoryId);
    if (!category || !category.isActive) {
      throw new BadRequestError('Invalid or inactive service category.');
    }

    if (files.length > MAX_LISTING_IMAGES) {
      throw new BadRequestError(`You can upload at most ${MAX_LISTING_IMAGES} images.`);
    }

    // P-01 pattern (ads.service.ts): parallel uploads before the DB write.
    const uploads = await Promise.all(files.map(file => uploadImage(file.buffer, 'service-listings')));

    try {
      return await prisma.$transaction(async tx =>
        serviceListingsRepository.create(tx, provider.id, {
          categoryId: input.categoryId,
          title: input.title,
          description: input.description,
          images: uploads.map(u => u.url),
          pricingType: input.pricingType,
          price: input.price,
          durationEstimate: input.durationEstimate,
          serviceLocation: input.serviceLocation,
        })
      );
    } catch (error) {
      // Same failure-cleanup convention as ads.service.ts's createAd —
      // if the DB write fails after upload, don't leave orphaned assets.
      await cleanupUploadedImages(uploads.map(u => u.publicId));
      throw error;
    }
  },

  getMyServiceListings: async (
    userId: string,
    query: { page?: number; limit?: number; status?: 'ACTIVE' | 'PAUSED' | 'DELETED' }
  ): Promise<PaginatedResult<ServiceListing>> => {
    const provider = await requireOwnProvider(userId);
    const { listings, total } = await serviceListingsRepository.findManyByProviderId(
      provider.id,
      query
    );
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return { items: listings, meta: buildPaginationMeta(total, page, limit) };
  },

  getServiceListings: async (
    query: GetServiceListingsQuery
  ): Promise<PaginatedResult<ServiceListingWithProvider>> => {
    const { listings, total } = await serviceListingsRepository.findMany(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return { items: listings, meta: buildPaginationMeta(total, page, limit) };
  },

  getServiceListingById: async (id: string): Promise<ServiceListingWithProvider> => {
    const listing = await serviceListingsRepository.findPublicById(id);
    if (!listing || listing.status === 'DELETED') {
      throw new NotFoundError('Service listing not found');
    }
    // Fire-and-forget: a failed view-count bump shouldn't fail the read.
    serviceListingsRepository.incrementViews(id).catch(() => undefined);
    return listing;
  },

  updateServiceListing: async (
    userId: string,
    id: string,
    input: UpdateServiceListingInput
  ): Promise<ServiceListing> => {
    const provider = await requireOwnProvider(userId);
    const listing = await serviceListingsRepository.findById(id);
    if (!listing) throw new NotFoundError('Service listing not found');
    if (listing.providerId !== provider.id) {
      throw new ForbiddenError('You do not own this service listing.');
    }

    if (input.categoryId) {
      const category = await serviceCategoriesRepository.findById(input.categoryId);
      if (!category || !category.isActive) {
        throw new BadRequestError('Invalid or inactive service category.');
      }
    }

    return serviceListingsRepository.update(id, input);
  },

  deleteServiceListing: async (userId: string, id: string): Promise<void> => {
    const provider = await requireOwnProvider(userId);
    const listing = await serviceListingsRepository.findById(id);
    if (!listing) throw new NotFoundError('Service listing not found');
    if (listing.providerId !== provider.id) {
      throw new ForbiddenError('You do not own this service listing.');
    }

    await serviceListingsRepository.softDelete(id);

    // Best-effort Cloudinary cleanup — same "don't fail the request over
    // a storage cleanup miss" convention as cleanupUploadedImages itself.
    await Promise.all(
      listing.images.map(imageUrl => {
        const publicId = extractCloudinaryPublicId(imageUrl);
        return publicId ? deleteImage(publicId).catch(() => undefined) : undefined;
      })
    );
  },
};
