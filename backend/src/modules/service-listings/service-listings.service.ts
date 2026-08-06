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
import { activityService, activityTemplates } from '../activity';
import { withServiceListingImagesLock } from '../../shared/utils/adLock';

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
    throw new ForbiddenError('Your seller account has been suspended.', 'SELLER_SUSPENDED');
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

    let listing: ServiceListing;
    try {
      listing = await prisma.$transaction(async tx =>
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

    // Gap #10: fire-and-forget, see activityService.record()'s own doc
    // comment. Logged for `userId` (the acting caller), not
    // provider.id — activity rows are always keyed by the real user.
    activityService.record({ userId, ...activityTemplates.serviceCreated(listing.id, listing.title) });

    return listing;
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
      throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
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
    if (!listing) throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
    if (listing.providerId !== provider.id) {
      throw new ForbiddenError('You do not own this service listing.', 'NOT_YOUR_SERVICE_LISTING');
    }

    if (input.categoryId) {
      const category = await serviceCategoriesRepository.findById(input.categoryId);
      if (!category || !category.isActive) {
        throw new BadRequestError('Invalid or inactive service category.');
      }
    }

    const updated = await serviceListingsRepository.update(id, input);

    // Gap #10: fire-and-forget, see createServiceListing's own comment.
    activityService.record({ userId, ...activityTemplates.serviceUpdated(updated.id, updated.title) });

    return updated;
  },

  deleteServiceListing: async (userId: string, id: string): Promise<void> => {
    const provider = await requireOwnProvider(userId);
    const listing = await serviceListingsRepository.findById(id);
    if (!listing) throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
    if (listing.providerId !== provider.id) {
      throw new ForbiddenError('You do not own this service listing.', 'NOT_YOUR_SERVICE_LISTING');
    }

    await serviceListingsRepository.softDelete(id);

    // Gap #10: fire-and-forget, see createServiceListing's own comment.
    activityService.record({ userId, ...activityTemplates.serviceDeleted(listing.id, listing.title) });

    // Best-effort Cloudinary cleanup — same "don't fail the request over
    // a storage cleanup miss" convention as cleanupUploadedImages itself.
    await Promise.all(
      listing.images.map(imageUrl => {
        const publicId = extractCloudinaryPublicId(imageUrl);
        return publicId ? deleteImage(publicId).catch(() => undefined) : undefined;
      })
    );
  },

  // Gap #3 fix: closes the report's finding — service listings had no
  // way to add/replace photos after creation (PATCH is JSON-only, no
  // images field). Mirrors ads.service.ts's addImages exactly.
  addImages: async (
    listingId: string,
    userId: string,
    files: Express.Multer.File[]
  ): Promise<ServiceListing> => {
    const provider = await requireOwnProvider(userId);
    const listing = await serviceListingsRepository.findById(listingId);
    if (!listing || listing.status === 'DELETED') {
      throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
    }
    if (listing.providerId !== provider.id) {
      throw new ForbiddenError('You do not own this service listing.', 'NOT_YOUR_SERVICE_LISTING');
    }
    if (listing.images.length + files.length > MAX_LISTING_IMAGES) {
      throw new BadRequestError(`A service listing can have at most ${MAX_LISTING_IMAGES} images`);
    }

    return withServiceListingImagesLock(listingId, async () => {
      const freshListing = await serviceListingsRepository.findById(listingId);
      if (!freshListing || freshListing.status === 'DELETED') {
        throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
      }
      if (freshListing.images.length + files.length > MAX_LISTING_IMAGES) {
        throw new BadRequestError(`A service listing can have at most ${MAX_LISTING_IMAGES} images`);
      }

      const uploads = await Promise.all(
        files.map(file => uploadImage(file.buffer, 'service-listings'))
      );
      try {
        return await serviceListingsRepository.addImages(
          listingId,
          uploads.map(upload => upload.url)
        );
      } catch (error) {
        await cleanupUploadedImages(uploads.map(upload => upload.publicId));
        throw error;
      }
    });
  },

  // Gap #3 fix: mirrors ads.service.ts's removeImage, including the
  // "can't remove the last image" guard (EPIC 1.5's rationale applies
  // identically here).
  removeImage: async (
    listingId: string,
    userId: string,
    imageUrl: string
  ): Promise<ServiceListing> => {
    const provider = await requireOwnProvider(userId);
    const listing = await serviceListingsRepository.findById(listingId);
    if (!listing || listing.status === 'DELETED') {
      throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
    }
    if (listing.providerId !== provider.id) {
      throw new ForbiddenError('You do not own this service listing.', 'NOT_YOUR_SERVICE_LISTING');
    }
    if (!listing.images.includes(imageUrl)) {
      throw new BadRequestError('Image not found in this service listing');
    }
    if (listing.images.length <= 1) {
      throw new BadRequestError(
        'Cannot remove the last image — a service listing must have at least one image. Add a replacement image first.',
        'MIN_IMAGES_REQUIRED'
      );
    }

    return withServiceListingImagesLock(listingId, async () => {
      try {
        const publicId = extractCloudinaryPublicId(imageUrl);
        if (publicId) await deleteImage(publicId);
      } catch {
        /* continue even if Cloudinary delete fails */
      }
      return serviceListingsRepository.removeImage(listingId, imageUrl);
    });
  },
};
