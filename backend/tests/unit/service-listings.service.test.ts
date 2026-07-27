import { serviceListingsService } from '../../src/modules/service-listings/service-listings.service';
import { serviceListingsRepository } from '../../src/modules/service-listings/service-listings.repository';
import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { serviceCategoriesRepository } from '../../src/modules/service-categories/service-categories.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';
import { uploadImage } from '../../src/config/cloudinary';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

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

describe('ServiceListingsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createServiceListing — availability gate (audit #8/#10)', () => {
    it('blocks listing creation when the provider is marked UNAVAILABLE', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue({
        ...mockProvider,
        availabilityStatus: 'UNAVAILABLE',
      });

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'cat-1' } as any, [])
      ).rejects.toThrow(ForbiddenError);

      expect(serviceListingsRepository.create).not.toHaveBeenCalled();
    });

    it('allows listing creation when the provider is AVAILABLE', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(
        mockProvider
      );
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (uploadImage as jest.Mock).mockResolvedValue({ url: 'http://img', publicId: 'pub-1' });
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
      (serviceListingsRepository.create as jest.Mock).mockResolvedValue({ id: 'listing-1' });

      const result = await serviceListingsService.createServiceListing(
        'user-1',
        { categoryId: 'cat-1' } as any,
        []
      );

      expect(result).toEqual({ id: 'listing-1' });
    });

    it('allows listing creation when the provider is BUSY (only UNAVAILABLE blocks)', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue({
        ...mockProvider,
        availabilityStatus: 'BUSY',
      });
      (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(mockCategory);
      (uploadImage as jest.Mock).mockResolvedValue({ url: 'http://img', publicId: 'pub-1' });
      (prisma.$transaction as jest.Mock) = jest.fn(async (cb: any) => cb({}));
      (serviceListingsRepository.create as jest.Mock).mockResolvedValue({ id: 'listing-2' });

      const result = await serviceListingsService.createServiceListing(
        'user-1',
        { categoryId: 'cat-1' } as any,
        []
      );

      expect(result).toEqual({ id: 'listing-2' });
    });

    it('blocks creation for a suspended seller regardless of availability', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({
        ...mockSellerProfile,
        suspended: true,
      });

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'cat-1' } as any, [])
      ).rejects.toThrow(ForbiddenError);

      expect(serviceProvidersRepository.findBySellerProfileId).not.toHaveBeenCalled();
    });
  });

  describe('updateServiceListing — ownership / IDOR', () => {
    it('rejects updating a listing owned by a different provider', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(
        mockProvider
      );
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'listing-1',
        providerId: 'someone-elses-provider-id',
      });

      await expect(
        serviceListingsService.updateServiceListing('user-1', 'listing-1', {} as any)
      ).rejects.toThrow(ForbiddenError);

      expect(serviceListingsRepository.update).not.toHaveBeenCalled();
    });

    it('allows updating a listing the caller actually owns', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(
        mockProvider
      );
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'listing-1',
        providerId: 'provider-1',
      });
      (serviceListingsRepository.update as jest.Mock).mockResolvedValue({ id: 'listing-1' });

      const result = await serviceListingsService.updateServiceListing('user-1', 'listing-1', {});
      expect(result).toEqual({ id: 'listing-1' });
    });

    it('throws NotFoundError for a nonexistent listing', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(
        mockProvider
      );
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        serviceListingsService.updateServiceListing('user-1', 'missing', {})
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deleteServiceListing — ownership / IDOR', () => {
    it('rejects deleting a listing owned by a different provider', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(
        mockProvider
      );
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue({
        id: 'listing-1',
        providerId: 'someone-elses-provider-id',
        images: [],
      });

      await expect(
        serviceListingsService.deleteServiceListing('user-1', 'listing-1')
      ).rejects.toThrow(ForbiddenError);

      expect(serviceListingsRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('requireOwnProvider — suspension gate', () => {
    it('blocks all writes for a suspended seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({
        ...mockSellerProfile,
        suspended: true,
      });

      await expect(
        serviceListingsService.updateServiceListing('user-1', 'listing-1', {})
      ).rejects.toThrow('Your seller account has been suspended.');
    });

    it('requires a seller profile to exist at all', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);

      await expect(
        serviceListingsService.createServiceListing('user-1', { categoryId: 'cat-1' } as any, [])
      ).rejects.toThrow(BadRequestError);
    });
  });
});
