import { serviceListingsService } from '../../src/modules/service-listings/service-listings.service';
import { serviceListingsRepository } from '../../src/modules/service-listings/service-listings.repository';
import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { serviceCategoriesRepository } from '../../src/modules/service-categories/service-categories.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';
import { uploadImage, deleteImage } from '../../src/config/cloudinary';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/service-listings/service-listings.repository');
jest.mock('../../src/modules/service-providers/service-providers.repository');
jest.mock('../../src/modules/service-categories/service-categories.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/config/cloudinary');

const mockSellerProfile = { id: 'seller-profile-1', userId: 'user-1', suspended: false };
const mockProvider = {
  id: 'provider-1',
  sellerProfileId: 'seller-profile-1',
  availabilityStatus: 'AVAILABLE',
};
const mockCategory = { id: 'cat-1', isActive: true };
const mockListing = {
  id: 'listing-1',
  providerId: 'provider-1',
  status: 'ACTIVE',
  images: ['https://res.cloudinary.com/demo/image/upload/v1/service-listings/abc.webp'],
};

describe('serviceListingsService — additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
    (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockProvider);
  });

  describe('createServiceListing — category and image validation', () => {
    it('throws BadRequestError when the category does not exist', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'missing' } as any, [])
      ).rejects.toThrow('Invalid or inactive service category.');
    });

    it('throws BadRequestError when the category is inactive', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue({
        ...mockCategory,
        isActive: false,
      });

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'cat-1' } as any, [])
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
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
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
      (prisma.$transaction as jest.Mock) = jest.fn().mockRejectedValue(new Error('DB write failed'));
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
      (prisma.$transaction as jest.Mock) = jest.fn().mockRejectedValue(new Error('DB write failed'));
      (deleteImage as jest.Mock).mockRejectedValue(new Error('cloudinary also down'));

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'cat-1' } as any, files)
      ).rejects.toThrow('DB write failed');
    });

    it('creates successfully with no images at all', async () => {
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
      (serviceListingsRepository.create as jest.Mock).mockResolvedValue(mockListing);

      const result = await serviceListingsService.createServiceListing(
        'user-1',
        { categoryId: 'cat-1' } as any,
        []
      );

      expect(result).toEqual(mockListing);
      expect(uploadImage).not.toHaveBeenCalled();
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

      expect(result).toEqual(mockListing);
      expect(serviceListingsRepository.incrementViews).toHaveBeenCalledWith('listing-1');
    });

    it('does not fail the read when the view-increment call rejects', async () => {
      (serviceListingsRepository.findPublicById as jest.Mock).mockResolvedValue(mockListing);
      (serviceListingsRepository.incrementViews as jest.Mock).mockRejectedValue(
        new Error('increment failed')
      );

      await expect(serviceListingsService.getServiceListingById('listing-1')).resolves.toEqual(
        mockListing
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

  describe('deleteServiceListing — success path with Cloudinary cleanup', () => {
    it('soft-deletes and cleans up every Cloudinary image on the listing', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceListingsRepository.softDelete as jest.Mock).mockResolvedValue({
        ...mockListing,
        status: 'DELETED',
      });
      (deleteImage as jest.Mock).mockResolvedValue(undefined);

      await serviceListingsService.deleteServiceListing('user-1', 'listing-1');

      expect(serviceListingsRepository.softDelete).toHaveBeenCalledWith('listing-1');
      expect(deleteImage).toHaveBeenCalledWith('service-listings/abc');
    });

    it('completes successfully even when Cloudinary cleanup fails for an image', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceListingsRepository.softDelete as jest.Mock).mockResolvedValue({
        ...mockListing,
        status: 'DELETED',
      });
      (deleteImage as jest.Mock).mockRejectedValue(new Error('cloudinary down'));

      await expect(
        serviceListingsService.deleteServiceListing('user-1', 'listing-1')
      ).resolves.toBeUndefined();
    });

    it('skips deleteImage for a non-Cloudinary image URL', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockListing,
        images: ['https://example.com/not-cloudinary.png'],
      });
      (serviceListingsRepository.softDelete as jest.Mock).mockResolvedValue({});

      await serviceListingsService.deleteServiceListing('user-1', 'listing-1');

      expect(deleteImage).not.toHaveBeenCalled();
    });

    it('handles a listing with no images at all', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue({
        ...mockListing,
        images: [],
      });
      (serviceListingsRepository.softDelete as jest.Mock).mockResolvedValue({});

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
