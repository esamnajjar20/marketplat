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
import { validateServiceListingAttributes, validateServiceTypeCapabilities } from '../service-types/service-types.service';
import { serviceTypesRepository } from '../service-types/service-types.repository';
import { sellersRepository } from '../sellers/sellers.repository';
import { activityService, activityTemplates } from '../activity';
import { fraudService } from '../fraud';
import { savedSearchEvents } from '../saved-searches';
import { withServiceListingImagesLock } from '../../shared/utils/adLock';
import { createEntityImageOperations } from '../../shared/utils/entityImageOperations';
import { logger } from '../../shared/utils/logger';
import { MAX_IMAGES_PER_ENTITY } from '../../config/limits';
import { cachedPublicList, bumpPublicListCache, hidePublicEntities } from '../../shared/utils/publicListCache';
import { ConflictError } from '../../shared/errors/ConflictError';

const MAX_LISTING_IMAGES = MAX_IMAGES_PER_ENTITY; // same cap as ads.images — see config/limits.ts

// addImages/removeImage used to be ~75 lines of
// hand-rolled logic here, near-identical to products.service.ts's copy
// of the same thing. Now built from the shared factory — see
// entityImageOperations.ts's doc comment for why ads.service.ts is not
// part of this extraction.
const listingImageOperations = createEntityImageOperations({
  repository: serviceListingsRepository,
  withLock: withServiceListingImagesLock,
  uploadFolder: 'service-listings',
  maxImages: MAX_LISTING_IMAGES,
  entityLabel: 'service listing',
  notFoundCode: 'SERVICE_LISTING_NOT_FOUND',
  notOwnedCode: 'NOT_YOUR_SERVICE_LISTING',
});

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
    files: Express.Multer.File[],
    offlineOperationId?: string | null,
  ): Promise<ServiceListing> => {
    if (offlineOperationId) {
      const existing = await prisma.serviceListing.findUnique({
        where: { offlineOperationId },
      });
      if (existing) {
        const provider = await requireOwnProvider(userId);
        if (existing.providerId !== provider.id) {
          throw new BadRequestError(
            'Offline operation id already used by another provider',
            'OFFLINE_OP_ID_CONFLICT',
          );
        }
        return existing;
      }
    }

    const provider = await requireOwnProvider(userId);

    // AUDIT-FIX (#3): require at least one image at create time.
    if (!files?.length) {
      throw new BadRequestError(
        'At least one service image is required.',
        'LISTING_IMAGE_REQUIRED',
      );
    }


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

    const serviceTypeId = input.serviceTypeId ?? category.serviceTypeId;
    if (serviceTypeId !== category.serviceTypeId) {
      throw new BadRequestError('The selected service type does not match the selected category.', 'SERVICE_TYPE_CATEGORY_MISMATCH');
    }
    const serviceType = await serviceTypesRepository.findActiveById(serviceTypeId);
    if (!serviceType) throw new BadRequestError('Invalid or inactive service type.', 'SERVICE_TYPE_INVALID');
    validateServiceTypeCapabilities(serviceType, input.pricingType, input.serviceLocation);
    await validateServiceListingAttributes(serviceTypeId, input.attributes);

    if (files.length > MAX_LISTING_IMAGES) {
      throw new BadRequestError(`You can upload at most ${MAX_LISTING_IMAGES} images.`);
    }

    // P-01 pattern (ads.service.ts): parallel uploads before the DB write.
    const uploads = await Promise.all(files.map(file => uploadImage(file.buffer, 'service-listings')));

    let listing: ServiceListing;
    try {
      listing = await prisma.$transaction(async tx => {
        const lockedCategory = await serviceCategoriesRepository.lockForListingCreation(tx, input.categoryId);
        if (!lockedCategory || !lockedCategory.isActive) {
          throw new BadRequestError('Invalid or inactive service category.');
        }
        if (lockedCategory.serviceTypeId !== serviceTypeId) {
          throw new BadRequestError(
            'The selected service type no longer matches the selected category.',
            'SERVICE_TYPE_CATEGORY_MISMATCH',
          );
        }
        const lockedServiceTypeActive = await serviceTypesRepository.lockForListingCreation(tx, serviceTypeId);
        if (lockedServiceTypeActive !== true) {
          throw new BadRequestError('Invalid or inactive service type.', 'SERVICE_TYPE_INVALID');
        }

        const createdListing = await serviceListingsRepository.create(tx, provider.id, {
          categoryId: input.categoryId,
          serviceTypeId: lockedCategory.serviceTypeId,
          attributes: input.attributes,
          title: input.title,
          description: input.description,
          images: uploads.map(u => u.url),
          pricingType: input.pricingType,
          price: input.price,
          durationEstimate: input.durationEstimate,
          serviceLocation: input.serviceLocation,
          offlineOperationId: offlineOperationId ?? null,
        });

        await tx.serviceProviderServiceType.upsert({
          where: { providerId_serviceTypeId: { providerId: provider.id, serviceTypeId: lockedCategory.serviceTypeId } },
          create: { providerId: provider.id, serviceTypeId: lockedCategory.serviceTypeId, attributes: {} },
          update: {},
        });

        return createdListing;
      });
    } catch (error: unknown) {
      // concurrent same offline op id
      if (
        offlineOperationId &&
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const existing = await prisma.serviceListing.findUnique({ where: { offlineOperationId } });
        if (existing && existing.providerId === provider.id) {
          listing = existing;
        } else {
          await cleanupUploadedImages(uploads.map(u => u.publicId));
          throw error;
        }
      } else {
        // Same failure-cleanup convention as ads.service.ts's createAd —
        // if the DB write fails after upload, don't leave orphaned assets.
        await cleanupUploadedImages(uploads.map(u => u.publicId));
        throw error;
      }
    }

    // Gap #10: fire-and-forget, see activityService.record()'s own doc
    // comment. Logged for `userId` (the acting caller), not
    // provider.id — activity rows are always keyed by the real user.
    activityService.record({ userId, ...activityTemplates.serviceCreated(listing.id, listing.title) });

    fraudService
      .scoreListing({
        entityType: 'SERVICE_LISTING',
        id: listing.id,
        userId,
        title: listing.title,
        description: listing.description ?? '',
        price: listing.price != null ? Number(listing.price) : null,
        categoryId: listing.categoryId,
      })
      .catch(() => undefined);

    // PLATFORM-WIDE-01: notify saved-search owners (type 'services')
    // whose criteria match this new listing — same fire-and-forget
    // contract as ads.service.ts's createAd -> savedSearchEvents
    // .onAdCreated / products.service.ts's createProduct ->
    // .onProductCreated.
    savedSearchEvents.onServiceListingCreated(listing, userId).catch((err) =>
      logger.error('Failed to process saved-search matches for new service listing', {
        err,
        listingId: listing.id,
      })
    );

    return listing;
  },

  getMyServiceListings: async (
    userId: string,
    query: {
      page?: number;
      limit?: number;
      status?: 'ACTIVE' | 'PAUSED' | 'DELETED';
      search?: string;
    }
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
    if (query.attributeFilters && Object.keys(query.attributeFilters).length > 0) {
      if (!query.serviceTypeId) {
        throw new BadRequestError('A service type is required when filtering by service-specific attributes.', 'ATTRIBUTE_FILTER_SERVICE_TYPE_REQUIRED');
      }
      const type = await serviceTypesRepository.findByIdWithFields(query.serviceTypeId);
      if (!type || !type.isActive) {
        throw new BadRequestError('Invalid or inactive service type.', 'SERVICE_TYPE_INVALID');
      }
      const listingFields = type.fields.filter((field) => field.isActive && field.scope === 'LISTING');
      const fieldMap = new Map(listingFields.map((field) => [field.key, field]));
      for (const [key, value] of Object.entries(query.attributeFilters)) {
        const field = fieldMap.get(key);
        if (!field) {
          throw new BadRequestError(`Unknown attribute filter: ${key}`, 'ATTRIBUTE_FILTER_NOT_ALLOWED');
        }
        if (value === null || value === undefined) continue;
        if (field.type === 'BOOLEAN' && typeof value !== 'boolean') {
          throw new BadRequestError(`Invalid value for ${key}.`, 'ATTRIBUTE_FILTER_INVALID');
        }
        if (field.type === 'NUMBER' && (typeof value !== 'number' || !Number.isFinite(value))) {
          throw new BadRequestError(`Invalid value for ${key}.`, 'ATTRIBUTE_FILTER_INVALID');
        }
        if ((field.type === 'SELECT' || field.type === 'MULTI_SELECT') && !Array.isArray(field.options)) {
          throw new BadRequestError(`Field ${key} is not configured with options.`, 'ATTRIBUTE_FILTER_INVALID');
        }
        if (field.type === 'SELECT' && typeof value === 'string') {
          const allowed = (field.options as Array<{ value: string }>).some((option) => option.value === value);
          if (!allowed) throw new BadRequestError(`Invalid option for ${key}.`, 'ATTRIBUTE_FILTER_INVALID');
        }
        if (field.type === 'MULTI_SELECT' && Array.isArray(value)) {
          const allowed = new Set((field.options as Array<{ value: string }>).map((option) => option.value));
          if (!value.every((item) => typeof item === 'string' && allowed.has(item))) {
            throw new BadRequestError(`Invalid option for ${key}.`, 'ATTRIBUTE_FILTER_INVALID');
          }
        }
      }
    }

    // Redis SWR cache; see publicListCache.ts.
    return cachedPublicList('service-listings', query, async () => {
      const { listings, total } = await serviceListingsRepository.findMany(query);
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      return { items: listings, meta: buildPaginationMeta(total, page, limit) };
    });
  },

  // FEAT-FAVORITE-POLYMORPHIC PR2: facade for cross-module use
  // (favoritesService), same pattern as ads.service.ts's
  // findAdForReference / stores.service.ts's findStoreForReference /
  // products.service.ts's findProductForReference — returns the
  // listing without side effects so favoritesService can validate a
  // SERVICE_LISTING favorite target exists without importing
  // serviceListingsRepository directly.
  // previously returned the bare
  // ServiceListing row (no provider relation), which
  // reportsService.createTargetReport needs to resolve the listing's
  // owning user for its self-report guard. Without the provider chain
  // on this return value, listingOwner was always undefined and every
  // "report this service" request threw NotFoundError — the feature
  // was silently broken end-to-end. Now uses findPublicById (which
  // already includes provider.sellerProfile) and returns that shape;
  // the reference caller is the only consumer and already handles the
  // wider type.
  findServiceListingForReference: async (
    id: string
  ): Promise<ServiceListingWithProvider | null> => {
    const listing = await serviceListingsRepository.findPublicById(id);
    if (!listing || listing.status === 'DELETED') return null;
    return listing;
  },

  getServiceListingById: async (id: string): Promise<ServiceListingWithProvider> => {
    const listing = await serviceListingsRepository.findPublicById(id);
    if (!listing || listing.status === 'DELETED') {
      throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
    }
    // SEC-FIX: same as products.service.ts's getProductById and
    // ads.service.ts's getAdById — findMany's list/search query now
    // excludes suspended-seller listings, but this direct-by-id lookup
    // didn't, so a suspended provider's listing page stayed fully
    // viewable/bookable via direct link even after dropping out of
    // search. provider.sellerProfile is already loaded by
    // listingWithRelations, so no extra query needed here.
    if (listing.provider.sellerProfile.suspended) {
      throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
    }
    // Fire-and-forget: a failed view-count bump shouldn't fail the read.
    serviceListingsRepository.incrementViews(id).catch(() => undefined);
    return {
      ...listing,
      provider: {
        ...listing.provider,
        contactPhone: '',
        sellerProfile: { ...listing.provider.sellerProfile, paymentMethods: null },
      },
    };
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

    if (listing.status === 'DELETED') {
      throw new BadRequestError('Deleted service listings cannot be edited.', 'SERVICE_LISTING_DELETED');
    }

    let finalServiceTypeId = listing.serviceTypeId;
    if (input.categoryId) {
      const category = await serviceCategoriesRepository.findById(input.categoryId);
      if (!category || !category.isActive) {
        throw new BadRequestError('Invalid or inactive service category.');
      }
      const categoryServiceType = await serviceTypesRepository.findById(category.serviceTypeId);
      if (!categoryServiceType || !categoryServiceType.isActive) {
        throw new BadRequestError('The selected service category belongs to an inactive service type.', 'SERVICE_TYPE_INVALID');
      }
      finalServiceTypeId = category.serviceTypeId;
    }
    if (input.serviceTypeId && input.serviceTypeId !== finalServiceTypeId) {
      throw new BadRequestError('The selected service type does not match the selected category.', 'SERVICE_TYPE_CATEGORY_MISMATCH');
    }
    const serviceTypeChanged = finalServiceTypeId !== listing.serviceTypeId;
    const effectiveServiceType = serviceTypeChanged
      ? await serviceTypesRepository.findActiveById(finalServiceTypeId)
      : await serviceTypesRepository.findByIdWithFields(finalServiceTypeId);
    if (!effectiveServiceType) throw new BadRequestError('Invalid or inactive service type.', 'SERVICE_TYPE_INVALID');

    // Deactivating a ServiceType is a publication/configuration switch, not
    // a historical-data lock. Existing listings must remain editable so an
    // owner can pause, correct, or remove them. A new type assignment still
    // requires an active type, and active types keep their full capability
    // checks.
    if (effectiveServiceType.isActive) {
      validateServiceTypeCapabilities(effectiveServiceType, input.pricingType ?? listing.pricingType, input.serviceLocation ?? listing.serviceLocation);
    }

    const attributesToValidate = input.attributes !== undefined
      ? input.attributes
      : serviceTypeChanged
        ? undefined
        : (listing.attributes as Record<string, unknown> | null) ?? undefined;
    await validateServiceListingAttributes(
      finalServiceTypeId,
      attributesToValidate,
      { allowInactive: !serviceTypeChanged, allowInactiveFields: !serviceTypeChanged },
    );

    const finalPricingType = input.pricingType ?? listing.pricingType;
    const finalPrice = input.price !== undefined ? input.price : listing.price;
    if (finalPricingType !== 'NEGOTIABLE' && (finalPrice == null || Number(finalPrice) <= 0)) {
      throw new BadRequestError('A positive price is required for this pricing type.', 'PRICE_REQUIRED');
    }
    if (finalPricingType === 'NEGOTIABLE' && input.price !== undefined && input.price !== null) {
      throw new BadRequestError('Negotiable services should not include a fixed price.', 'PRICE_NOT_ALLOWED');
    }

    const updated = await serviceListingsRepository.update(id, input);
    if (serviceTypeChanged) {
      await prisma.serviceProviderServiceType.upsert({
        where: { providerId_serviceTypeId: { providerId: provider.id, serviceTypeId: finalServiceTypeId } },
        create: { providerId: provider.id, serviceTypeId: finalServiceTypeId, attributes: {} },
        update: {},
      });
    }
    if (input.status && input.status !== 'ACTIVE') {
      await hidePublicEntities('service-listings');
    } else {
      await bumpPublicListCache('service-listings');
    }

    // Gap #10: fire-and-forget, see createServiceListing's own comment.
    activityService.record({ userId, ...activityTemplates.serviceUpdated(updated.id, updated.title) });

    fraudService
      .scoreListing({
        entityType: 'SERVICE_LISTING',
        id: updated.id,
        userId,
        title: updated.title,
        description: updated.description ?? '',
        price: updated.price != null ? Number(updated.price) : null,
        categoryId: updated.categoryId,
      })
      .catch(() => undefined);

    return updated;
  },

  deleteServiceListing: async (userId: string, id: string): Promise<void> => {
    const provider = await requireOwnProvider(userId);
    const listing = await serviceListingsRepository.findById(id);
    if (!listing) throw new NotFoundError('Service listing not found', 'SERVICE_LISTING_NOT_FOUND');
    if (listing.providerId !== provider.id) {
      throw new ForbiddenError('You do not own this service listing.', 'NOT_YOUR_SERVICE_LISTING');
    }

    await prisma.$transaction(async tx => {
      const openRequestCount = await tx.serviceRequest.count({
        where: { listingId: id, status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'DISPUTED'] } },
      });
      if (openRequestCount > 0) {
        throw new ConflictError(
          'This service listing has open requests and cannot be deleted. Pause it instead.',
          'SERVICE_LISTING_HAS_OPEN_REQUESTS',
        );
      }
      await tx.serviceListing.update({ where: { id }, data: { status: 'DELETED' } });
    });
    await hidePublicEntities('service-listings');

    // Gap #10: fire-and-forget, see createServiceListing's own comment.
    activityService.record({ userId, ...activityTemplates.serviceDeleted(listing.id, listing.title) });

    // Keep listing images after soft-delete: historical service requests
    // retain listing references and must not render broken Cloudinary URLs.
    // Physical asset cleanup belongs to a separate retention job after the
    // historical reference window has elapsed.
  },

  // Gap #3 fix: closes the report's finding — service listings had no
  // way to add/replace photos after creation (JSON-only, no
  // images field). Delegates to the shared factory ().
  addImages: async (
    listingId: string,
    userId: string,
    files: Express.Multer.File[]
  ): Promise<ServiceListing> => {
    const provider = await requireOwnProvider(userId);
    return listingImageOperations.addImages(listingId, listing => listing.providerId === provider.id, files);
  },

  // Gap #3 fix: mirrors ads.service.ts's removeImage, including the
  // "can't remove the last image" guard (EPIC 1.5's rationale applies
  // identically here). Delegates to the shared factory ().
  removeImage: async (
    listingId: string,
    userId: string,
    imageUrl: string
  ): Promise<ServiceListing> => {
    const provider = await requireOwnProvider(userId);
    return listingImageOperations.removeImage(listingId, listing => listing.providerId === provider.id, imageUrl);
  },

  // Gap #11: delegates to the shared factory's reorderImages.
  reorderImages: async (
    listingId: string,
    userId: string,
    orderedImages: string[]
  ): Promise<ServiceListing> => {
    const provider = await requireOwnProvider(userId);
    return listingImageOperations.reorderImages(listingId, listing => listing.providerId === provider.id, orderedImages);
  },
};
