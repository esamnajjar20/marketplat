import { serviceListingsService } from '../../src/modules/service-listings/service-listings.service';
import { serviceListingsRepository } from '../../src/modules/service-listings/service-listings.repository';
import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { serviceCategoriesRepository } from '../../src/modules/service-categories/service-categories.repository';
import { serviceTypesRepository } from '../../src/modules/service-types/service-types.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';
import { uploadImage, deleteImage } from '../../src/config/cloudinary';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { hidePublicEntities } from '../../src/shared/utils/publicListCache';

jest.mock('../../src/modules/service-listings/service-listings.repository');
jest.mock('../../src/modules/service-providers/service-providers.repository');
jest.mock('../../src/modules/service-categories/service-categories.repository');
jest.mock('../../src/modules/service-types/service-types.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/config/cloudinary');
jest.mock('../../src/modules/follows/follows.service', () => ({
  followsService: { notifyActivityForTargets: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../src/modules/fraud', () => ({
  fraudService: { scoreListing: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../src/modules/saved-searches', () => ({
  savedSearchEvents: { onServiceListingCreated: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../src/shared/utils/publicListCache', () => ({
  cachedPublicList: jest.fn((_ns: string, _query: unknown, fetcher: () => Promise<unknown>) =>
    fetcher()
  ),
  bumpPublicListCache: jest.fn().mockResolvedValue(undefined),
  hidePublicEntities: jest.fn().mockResolvedValue(undefined),
}));

const mockSellerProfile = { id: 'seller-profile-1', userId: 'user-1', suspended: false };
const mockProvider = {
  id: 'provider-1',
  sellerProfileId: 'seller-profile-1',
  availabilityStatus: 'AVAILABLE',
};
const mockCategory = { id: 'cat-1', isActive: true, serviceTypeId: 'st_general' };
// extractCloudinaryPublicId rejects URLs whose path cloud-name does not
// match CLOUDINARY_CLOUD_NAME when that env var is set. Use the configured
// name (or "demo") so cleanup assertions stay valid across environments.
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'demo';
const mockListing = {
  id: 'listing-1',
  providerId: 'provider-1',
  status: 'ACTIVE',
  title: 'Listing',
  categoryId: 'cat-1',
  serviceTypeId: 'st_general',
  pricingType: 'FIXED',
  price: 100,
  serviceLocation: 'AT_PROVIDER',
  attributes: null,
  images: [`https://res.cloudinary.com/${cloudName}/image/upload/v1/service-listings/abc.webp`],
  provider: { sellerProfile: { suspended: false } },
};
// Public reads strip the provider's contact phone and payment methods.
const redactedMockListing = {
  ...mockListing,
  provider: {
    contactPhone: '',
    sellerProfile: { ...mockListing.provider.sellerProfile, paymentMethods: null },
  },
};
const oneFile = [{ buffer: Buffer.from('x') }] as any;

describe('serviceListingsService — additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
    (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockProvider);
    (serviceTypesRepository.findActiveById as jest.Mock).mockResolvedValue({
      id: 'st_general',
      isActive: true,
      capabilities: {},
      fields: [],
    });
    (serviceTypesRepository.findById as jest.Mock).mockResolvedValue({
      id: 'st_general',
      isActive: true,
      capabilities: {},
      fields: [],
    });
    (serviceTypesRepository.findByIdWithFields as jest.Mock).mockResolvedValue({
      id: 'st_general',
      isActive: true,
      capabilities: {},
      fields: [],
    });
    (serviceTypesRepository.findByIdWithAllFields as jest.Mock).mockResolvedValue({
      id: 'st_general',
      isActive: true,
      capabilities: {},
      fields: [],
    });
    (serviceTypesRepository.lockForListingCreation as jest.Mock).mockResolvedValue(true);
    (serviceCategoriesRepository.lockForListingCreation as jest.Mock).mockResolvedValue({
      serviceTypeId: 'st_general',
      isActive: true,
    });
  });

  afterEach(() => jest.restoreAllMocks());

  describe('createServiceListing — category and image validation', () => {
    it('throws BadRequestError when the category does not exist', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'missing' } as any, oneFile)
      ).rejects.toThrow('Invalid or inactive service category.');
    });

    it('throws BadRequestError when the category is inactive', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        isActive: false,
      });

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'cat-1' } as any, oneFile)
      ).rejects.toThrow('Invalid or inactive service category.');
    });

    it('throws BadRequestError when more than 10 images are uploaded', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      const files = Array.from({ length: 11 }, () => ({ buffer: Buffer.from('x') })) as any;

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'cat-1' } as any, files)
      ).rejects.toThrow('You can upload at most 10 images.');
      expect(uploadImage).not.toHaveBeenCalled();
    });

    it('accepts exactly 10 images (boundary)', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      const files = Array.from({ length: 10 }, () => ({ buffer: Buffer.from('x') })) as any;
      (uploadImage as jest.Mock).mockResolvedValue({ url: 'http://img', publicId: 'pub-1' });
      jest
        .spyOn(prisma, '$transaction')
        .mockImplementation(async (cb: any) =>
          cb({ serviceProviderServiceType: { upsert: jest.fn().mockResolvedValue({}) } }) as any
        );
      (serviceListingsRepository.create as jest.Mock).mockResolvedValue(mockListing);

      const result = await serviceListingsService.createServiceListing(
        'user-1',
        { categoryId: 'cat-1' } as any,
        files
      );

      expect(result).toEqual(mockListing);
      expect(uploadImage).toHaveBeenCalledTimes(10);
    });

    it('cleans up uploaded images when the DB transaction fails', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      const files = [{ buffer: Buffer.from('x') }] as any;
      (uploadImage as jest.Mock).mockResolvedValue({ url: 'http://img', publicId: 'pub-1' });
      jest.spyOn(prisma, '$transaction').mockImplementation().mockRejectedValue(new Error('DB write failed') as any);
      (deleteImage as jest.Mock).mockResolvedValue(undefined);

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'cat-1' } as any, files)
      ).rejects.toThrow('DB write failed');

      expect(deleteImage).toHaveBeenCalledWith('pub-1');
    });

    it('still rethrows the original error even if the Cloudinary cleanup itself fails', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      const files = [{ buffer: Buffer.from('x') }] as any;
      (uploadImage as jest.Mock).mockResolvedValue({ url: 'http://img', publicId: 'pub-1' });
      jest.spyOn(prisma, '$transaction').mockImplementation().mockRejectedValue(new Error('DB write failed') as any);
      (deleteImage as jest.Mock).mockRejectedValue(new Error('cloudinary also down'));

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'cat-1' } as any, files)
      ).rejects.toThrow('DB write failed');
    });

    it('rejects creation with no images because public listings require a service image', async () => {
      await expect(
        serviceListingsService.createServiceListing(
          'user-1',
          { categoryId: 'cat-1' } as any,
          []
        )
      ).rejects.toThrow('At least one service image is required.');
      expect(uploadImage).not.toHaveBeenCalled();
      expect(serviceListingsRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('getMyServiceListings', () => {
    it('returns paginated results for the caller’s own provider profile', async () => {
      (serviceListingsRepository.findManyByProviderId as jest.Mock).mockResolvedValue({
        listings: [mockListing],
        total: 1,
      });

      const result = await serviceListingsService.getMyServiceListings('user-1', {});

      expect(result.items).toEqual([mockListing]);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('uses the page/limit provided in the query', async () => {
      (serviceListingsRepository.findManyByProviderId as jest.Mock).mockResolvedValue({
        listings: [],
        total: 0,
      });

      const result = await serviceListingsService.getMyServiceListings('user-1', {
        page: 2,
        limit: 5,
      });

      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(5);
    });

    it('throws BadRequestError when the caller has no provider profile', async () => {
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);

      await expect(serviceListingsService.getMyServiceListings('user-1', {})).rejects.toThrow(
        BadRequestError
      );
    });
  });

  describe('getServiceListings (public browse)', () => {
    it('returns paginated public results with default page/limit', async () => {
      (serviceListingsRepository.findMany as jest.Mock).mockResolvedValue({
        listings: [mockListing],
        total: 1,
      });

      const result = await serviceListingsService.getServiceListings({} as any);

      expect(result.items).toEqual([mockListing]);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('returns an empty result set with correct pagination meta', async () => {
      (serviceListingsRepository.findMany as jest.Mock).mockResolvedValue({ listings: [], total: 0 });

      const result = await serviceListingsService.getServiceListings({ page: 5, limit: 10 } as any);

      expect(result.items).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('getServiceListingById', () => {
    it('returns the listing and fires a non-blocking view increment', async () => {
      (serviceListingsRepository.findPublicById as jest.Mock).mockResolvedValue(mockListing);
      (serviceListingsRepository.incrementViews as jest.Mock).mockResolvedValue(mockListing);

      const result = await serviceListingsService.getServiceListingById('listing-1');

      expect(result).toEqual(redactedMockListing);
      expect(serviceListingsRepository.incrementViews).toHaveBeenCalledWith('listing-1');
    });

    it('does not fail the read when the view-increment call rejects', async () => {
      (serviceListingsRepository.findPublicById as jest.Mock).mockResolvedValue(mockListing);
      (serviceListingsRepository.incrementViews as jest.Mock).mockRejectedValue(
        new Error('increment failed')
      );

      await expect(serviceListingsService.getServiceListingById('listing-1')).resolves.toEqual(
        redactedMockListing
      );
    });

    it('throws NotFoundError when the listing does not exist', async () => {
      (serviceListingsRepository.findPublicById as jest.Mock).mockResolvedValue(null);

      await expect(serviceListingsService.getServiceListingById('missing')).rejects.toThrow(
        NotFoundError
      );
      expect(serviceListingsRepository.incrementViews).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the listing is soft-deleted (status DELETED)', async () => {
      (serviceListingsRepository.findPublicById as jest.Mock).mockResolvedValue({
        ...mockListing,
        status: 'DELETED',
      });

      await expect(serviceListingsService.getServiceListingById('listing-1')).rejects.toThrow(
        NotFoundError
      );
      expect(serviceListingsRepository.incrementViews).not.toHaveBeenCalled();
    });
  });

  describe('updateServiceListing — category revalidation', () => {
    it('throws BadRequestError when updating to an invalid category', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        serviceListingsService.updateServiceListing('user-1', 'listing-1', {
          categoryId: 'missing',
        } as any)
      ).rejects.toThrow('Invalid or inactive service category.');
    });

    it('throws BadRequestError when updating to an inactive category', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        isActive: false,
      });

      await expect(
        serviceListingsService.updateServiceListing('user-1', 'listing-1', {
          categoryId: 'cat-1',
        } as any)
      ).rejects.toThrow('Invalid or inactive service category.');
    });

    it('does not re-check the category at all when categoryId is not part of the update', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceListingsRepository.update as jest.Mock).mockResolvedValue(mockListing);

      await serviceListingsService.updateServiceListing('user-1', 'listing-1', {
        title: 'New title',
      } as any);

      expect(serviceCategoriesRepository.findById).not.toHaveBeenCalled();
    });

    it('succeeds when updating to a valid, active category', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (serviceListingsRepository.update as jest.Mock).mockResolvedValue({
        ...mockListing,
        categoryId: 'cat-1',
      });

      const result = await serviceListingsService.updateServiceListing('user-1', 'listing-1', {
        categoryId: 'cat-1',
      } as any);

      expect(result.categoryId).toBe('cat-1');
    });
  });

  describe('deleteServiceListing', () => {
    const mockDeleteTx = (openRequests = 0) => {
      const tx = {
        serviceRequest: { count: jest.fn().mockResolvedValue(openRequests) },
        serviceListing: { update: jest.fn().mockResolvedValue({ ...mockListing, status: 'DELETED' }) },
      };
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb(tx) as any);
      return tx;
    };

    it('soft-deletes inside a transaction and hides the listing from public caches', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      const tx = mockDeleteTx();

      await expect(
        serviceListingsService.deleteServiceListing('user-1', 'listing-1')
      ).resolves.toBeUndefined();

      expect(tx.serviceRequest.count).toHaveBeenCalledWith({
        where: {
          listingId: 'listing-1',
          status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS', 'DISPUTED'] },
        },
      });
      expect(tx.serviceListing.update).toHaveBeenCalledWith({
        where: { id: 'listing-1' },
        data: { status: 'DELETED' },
      });
      expect(hidePublicEntities).toHaveBeenCalledWith('service-listings');
    });

    it('keeps the Cloudinary images: historical service requests still reference them', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      mockDeleteTx();

      await serviceListingsService.deleteServiceListing('user-1', 'listing-1');

      expect(deleteImage).not.toHaveBeenCalled();
    });

    it('rejects with ConflictError when the listing still has open requests', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      const tx = mockDeleteTx(2);

      await expect(
        serviceListingsService.deleteServiceListing('user-1', 'listing-1')
      ).rejects.toThrow(ConflictError);

      expect(tx.serviceListing.update).not.toHaveBeenCalled();
      expect(hidePublicEntities).not.toHaveBeenCalled();
    });

    it('handles a listing with no images at all', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockListing,
        images: [],
      });
      mockDeleteTx();

      await expect(
        serviceListingsService.deleteServiceListing('user-1', 'listing-1')
      ).resolves.toBeUndefined();
      expect(deleteImage).not.toHaveBeenCalled();
    });

    it('throws NotFoundError for a nonexistent listing', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        serviceListingsService.deleteServiceListing('user-1', 'missing')
      ).rejects.toThrow(NotFoundError);
    });
  });
});
