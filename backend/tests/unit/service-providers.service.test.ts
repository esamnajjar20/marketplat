import { serviceProvidersService } from '../../src/modules/service-providers/service-providers.service';
import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';
import { withServiceProviderCreationLock } from '../../src/shared/utils/serviceProviderLock';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/service-providers/service-providers.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/shared/utils/serviceProviderLock');
jest.mock('../../src/config/prisma', () => ({
  prisma: { $transaction: jest.fn() },
}));

const userId = 'user-1';
const mockSellerProfile = { id: 'seller-profile-1', userId, suspended: false } as any;
const mockProvider = { id: 'provider-1', sellerProfileId: 'seller-profile-1' } as any;

const createInput = {
  businessName: 'Acme Repairs',
  businessType: 'INDIVIDUAL' as const,
  description: 'We fix things',
  serviceAreaCities: ['Gaza'],
  workingHours: { sun: null } as any,
  contactPhone: '0599123456',
};

describe('serviceProvidersService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // By default, run the wrapped callback straight through — most tests
    // only care about what happens inside the lock, not the lock itself.
    (withServiceProviderCreationLock as jest.Mock).mockImplementation((_id, fn) => fn());
  });

  describe('createServiceProvider', () => {
    it('throws BadRequestError when the user has no seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);

      await expect(serviceProvidersService.createServiceProvider(userId, createInput)).rejects.toThrow(
        'You need a seller profile before becoming a service provider.'
      );
      expect(withServiceProviderCreationLock).not.toHaveBeenCalled();
    });

    it('throws ForbiddenError when the seller profile is suspended', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({
        ...mockSellerProfile,
        suspended: true,
      });

      await expect(serviceProvidersService.createServiceProvider(userId, createInput)).rejects.toThrow(
        ForbiddenError
      );
      expect(withServiceProviderCreationLock).not.toHaveBeenCalled();
    });

    it('throws ConflictError on the unlocked pre-check when a provider profile already exists', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockProvider);

      await expect(serviceProvidersService.createServiceProvider(userId, createInput)).rejects.toThrow(
        'You already have a service provider profile.'
      );
      expect(withServiceProviderCreationLock).not.toHaveBeenCalled();
    });

    it('throws ConflictError on the locked re-check even if the unlocked pre-check passed (TOCTOU)', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock)
        .mockResolvedValueOnce(null) // unlocked pre-check
        .mockResolvedValueOnce(mockProvider); // locked re-check

      await expect(serviceProvidersService.createServiceProvider(userId, createInput)).rejects.toThrow(
        ConflictError
      );
    });

    it('creates the provider inside a transaction when no profile exists', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb({}));
      (serviceProvidersRepository.create as jest.Mock).mockResolvedValue(mockProvider);

      const result = await serviceProvidersService.createServiceProvider(userId, createInput);

      expect(result).toEqual(mockProvider);
      expect(serviceProvidersRepository.create).toHaveBeenCalledWith(
        {},
        mockSellerProfile.id,
        expect.objectContaining({
          businessName: createInput.businessName,
          businessType: createInput.businessType,
          description: createInput.description,
          serviceAreaCities: createInput.serviceAreaCities,
          workingHours: createInput.workingHours,
          contactPhone: createInput.contactPhone,
        })
      );
    });

    it('maps a P2002 unique-constraint error from the transaction to ConflictError', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      const p2002Error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      (prisma.$transaction as jest.Mock).mockRejectedValue(p2002Error);

      await expect(serviceProvidersService.createServiceProvider(userId, createInput)).rejects.toThrow(
        'You already have a service provider profile.'
      );
    });

    it('rethrows non-P2002 errors from the transaction unchanged', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

      await expect(serviceProvidersService.createServiceProvider(userId, createInput)).rejects.toThrow(
        'DB connection lost'
      );
    });

    it('propagates ConflictError from the lock itself (lock not acquired)', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      (withServiceProviderCreationLock as jest.Mock).mockRejectedValue(
        new ConflictError('Your service provider profile is already being created. Please wait a moment.')
      );

      await expect(serviceProvidersService.createServiceProvider(userId, createInput)).rejects.toThrow(
        'Your service provider profile is already being created. Please wait a moment.'
      );
    });
  });

  describe('getMyServiceProvider', () => {
    it('throws NotFoundError when the user has no seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      await expect(serviceProvidersService.getMyServiceProvider(userId)).rejects.toThrow(
        'Seller profile not found'
      );
    });

    it('throws NotFoundError when the seller has no provider profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      await expect(serviceProvidersService.getMyServiceProvider(userId)).rejects.toThrow(
        'Service provider profile not found'
      );
    });

    it('returns the provider profile when found', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockProvider);
      const result = await serviceProvidersService.getMyServiceProvider(userId);
      expect(result).toEqual(mockProvider);
    });
  });

  describe('updateMyServiceProvider', () => {
    it('throws NotFoundError when the user has no seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      await expect(
        serviceProvidersService.updateMyServiceProvider(userId, { businessName: 'New' })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when no provider profile exists for the seller', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      await expect(
        serviceProvidersService.updateMyServiceProvider(userId, { businessName: 'New' })
      ).rejects.toThrow('Service provider profile not found');
    });

    it('updates the provider profile by its own id when found', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockProvider);
      const updated = { ...mockProvider, businessName: 'New' };
      (serviceProvidersRepository.update as jest.Mock).mockResolvedValue(updated);

      const result = await serviceProvidersService.updateMyServiceProvider(userId, {
        businessName: 'New',
      });

      expect(serviceProvidersRepository.update).toHaveBeenCalledWith(mockProvider.id, {
        businessName: 'New',
      });
      expect(result).toEqual(updated);
    });
  });

  describe('getPublicServiceProvider', () => {
    it('throws NotFoundError when no provider matches the id', async () => {
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(null);
      await expect(serviceProvidersService.getPublicServiceProvider('missing')).rejects.toThrow(
        'Service provider not found'
      );
    });

    it('returns the provider (with seller) when found', async () => {
      const withSeller = { ...mockProvider, sellerProfile: { id: 'seller-profile-1' } };
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(withSeller);
      const result = await serviceProvidersService.getPublicServiceProvider('provider-1');
      expect(result).toEqual(withSeller);
    });
  });

  describe('findNearby', () => {
    it('derives pagination params and returns providers with meta', async () => {
      const rows = [{ id: 'p1', distanceKm: 2 }];
      (serviceProvidersRepository.findNearby as jest.Mock).mockResolvedValue({ rows, total: 1 });

      const result = await serviceProvidersService.findNearby({
        lat: 31.5,
        lng: 34.45,
        radius: 10,
        page: 1,
        limit: 20,
      } as any);

      expect(serviceProvidersRepository.findNearby).toHaveBeenCalledWith(31.5, 34.45, 10, 0, 20);
      expect(result.providers).toEqual(rows);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 1, page: 1, limit: 20, totalPages: 1 })
      );
    });

    it('defaults page/limit when omitted from the query', async () => {
      (serviceProvidersRepository.findNearby as jest.Mock).mockResolvedValue({ rows: [], total: 0 });

      await serviceProvidersService.findNearby({ lat: 31.5, lng: 34.45, radius: 10 } as any);

      expect(serviceProvidersRepository.findNearby).toHaveBeenCalledWith(31.5, 34.45, 10, 0, 20);
    });
  });
});
