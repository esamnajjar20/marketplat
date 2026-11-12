import { serviceProvidersService } from '../../src/modules/services/service-providers/service-providers.service';
import { serviceProvidersRepository } from '../../src/modules/services/service-providers/service-providers.repository';
import { serviceListingsRepository } from '../../src/modules/services/service-listings/service-listings.repository';
import { serviceRequestsRepository } from '../../src/modules/services/service-requests/service-requests.repository';
import { appointmentsRepository } from '../../src/modules/services/appointments/appointments.repository';
import { serviceReviewsRepository } from '../../src/modules/services/service-reviews/service-reviews.repository';
import { sellersRepository } from '../../src/modules/identity/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';
import { withServiceProviderCreationLock } from '../../src/shared/locks/serviceProviderLock';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/services/service-providers/service-providers.repository');
jest.mock('../../src/modules/services/service-listings/service-listings.repository');
jest.mock('../../src/modules/services/service-requests/service-requests.repository');
jest.mock('../../src/modules/services/appointments/appointments.repository');
jest.mock('../../src/modules/services/service-reviews/service-reviews.repository');
jest.mock('../../src/modules/identity/sellers/sellers.repository');
jest.mock('../../src/shared/locks/serviceProviderLock');
jest.mock('../../src/config/prisma', () => ({
  prisma: { $transaction: jest.fn() },
}));
jest.mock('../../src/shared/cache/publicListCache', () => ({
  cachedPublicList: jest.fn((_ns: string, _query: unknown, fetcher: () => Promise<unknown>) =>
    fetcher()
  ),
  bumpPublicListCache: jest.fn().mockResolvedValue(undefined),
  hidePublicEntities: jest.fn().mockResolvedValue(undefined),
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

  describe('getMyServiceProviderDashboard', () => {
    it('returns analytics and the requested listings page after resolving ownership once', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(mockProvider);
      (serviceListingsRepository.getStatsByProviderId as jest.Mock).mockResolvedValue({ totalViews: 120, activeCount: 4 });
      (serviceListingsRepository.findTopByProviderId as jest.Mock).mockResolvedValue([
        { id: 'listing-1', title: 'صيانة', views: 50, images: ['image-1'] },
      ]);
      (serviceRequestsRepository.countPendingByProviderId as jest.Mock).mockResolvedValue(3);
      (serviceRequestsRepository.countTerminalStatsByProviderId as jest.Mock).mockResolvedValue({ completed: 8, cancelledOrRejected: 2 });
      (serviceRequestsRepository.sumRevenueByProviderId as jest.Mock).mockResolvedValue(450);
      (appointmentsRepository.countUpcomingByProviderId as jest.Mock).mockResolvedValue(2);
      (serviceReviewsRepository.getRatingSummary as jest.Mock).mockResolvedValue({ avg: 4.8, count: 12 });

      const ownListing = { id: 'owned-listing-1', title: 'صيانة منزلية', status: 'ACTIVE' } as any;
      (serviceListingsRepository.findManyByProviderId as jest.Mock).mockResolvedValue({
        listings: [ownListing],
        total: 11,
      });

      const result = await serviceProvidersService.getMyServiceProviderDashboard(userId, {
        period: 'all', page: 2, limit: 10, status: 'ACTIVE', search: 'صيانة',
      });

      expect(result.listings.items).toEqual([ownListing]);
      expect(result.listings.meta).toEqual(expect.objectContaining({
        total: 11, page: 2, limit: 10, totalPages: 2,
      }));
      expect(serviceListingsRepository.findManyByProviderId).toHaveBeenCalledWith('provider-1', {
        page: 2, limit: 10, status: 'ACTIVE', search: 'صيانة',
      });
      expect(result.analytics).toEqual(expect.objectContaining({
        totalViews: 120,
        activeListings: 4,
        pendingRequests: 3,
        completedRequests: 8,
        fulfillmentRate: 80,
        upcomingAppointments: 2,
        averageRating: 4.8,
        reviewCount: 12,
        revenue: 450,
        period: 'all',
      }));
      expect(result.analytics.topListings).toEqual([
        { id: 'listing-1', title: 'صيانة', views: 50, image: 'image-1' },
      ]);
      expect(sellersRepository.findByUserId).toHaveBeenCalledTimes(1);
      expect(serviceProvidersRepository.findBySellerProfileId).toHaveBeenCalledTimes(1);
    });

    it('preserves the existing not-found behavior for users without provider profiles', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(mockSellerProfile);
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);

      await expect(serviceProvidersService.getMyServiceProviderDashboard(userId, { period: 'all', page: 1, limit: 10 })).rejects.toThrow(NotFoundError);
      expect(serviceListingsRepository.getStatsByProviderId).not.toHaveBeenCalled();
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

    // BUG FIX: findPublicById alone never included `listings` — the
    // frontend's ServiceProviderPublic type and ServiceProviderListings
    // component have always expected one, and its absence crashed
    // /service-providers/[id] at runtime ("Cannot read properties of
    // undefined (reading 'filter')"). getPublicServiceProvider now also
    // fetches the provider's ACTIVE listings and attaches them.
    it('returns the provider (with seller) plus its ACTIVE listings when found', async () => {
      const withSeller = { ...mockProvider, sellerProfile: { id: 'seller-profile-1', suspended: false } };
      const activeListings = [{ id: 'listing-1', status: 'ACTIVE' }] as any;
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(withSeller);
      (serviceListingsRepository.findManyByProviderId as jest.Mock).mockResolvedValue({
        listings: activeListings,
        total: 1,
      });

      const result = await serviceProvidersService.getPublicServiceProvider('provider-1');

      expect(serviceListingsRepository.findManyByProviderId).toHaveBeenCalledWith('provider-1', {
        status: 'ACTIVE',
        limit: 100,
      });
      expect(result).toEqual({
        ...withSeller,
        contactPhone: '',
        latitude: null,
        longitude: null,
        sellerProfile: { ...withSeller.sellerProfile, paymentMethods: null },
        listings: activeListings,
      });
    });

    // SEC-see getPublicServiceProvider's comment — a
    // suspended seller's provider must 404 here even though
    // findPublicById itself has no way to filter for it.
    it('throws NotFoundError when the seller is suspended', async () => {
      const suspended = { ...mockProvider, sellerProfile: { id: 'seller-profile-1', suspended: true } };
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(suspended);

      await expect(serviceProvidersService.getPublicServiceProvider('provider-1')).rejects.toThrow(
        NotFoundError
      );
      expect(serviceListingsRepository.findManyByProviderId).not.toHaveBeenCalled();
    });

    it('does not fetch listings when the provider is not found', async () => {
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(null);
      await expect(serviceProvidersService.getPublicServiceProvider('missing')).rejects.toThrow(
        NotFoundError
      );
      expect(serviceListingsRepository.findManyByProviderId).not.toHaveBeenCalled();
    });
  });

  describe('getServiceProviders', () => {
    it('derives pagination params and returns providers with meta', async () => {
      const rows = [{ id: 'p1', businessName: 'Gaza Fixer' }];
      (serviceProvidersRepository.findMany as jest.Mock).mockResolvedValue({ rows, total: 1 });

      const result = await serviceProvidersService.getServiceProviders({
        city: 'Gaza',
        page: 1,
        limit: 20,
      } as any);

      expect(serviceProvidersRepository.findMany).toHaveBeenCalledWith(
        { city: 'Gaza', page: 1, limit: 20 },
        0,
        20
      );
      expect(result.providers).toEqual(rows);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 1, page: 1, limit: 20, totalPages: 1 })
      );
    });

    it('passes an empty/no-city query straight through unchanged (general results)', async () => {
      (serviceProvidersRepository.findMany as jest.Mock).mockResolvedValue({ rows: [], total: 0 });

      await serviceProvidersService.getServiceProviders({} as any);

      expect(serviceProvidersRepository.findMany).toHaveBeenCalledWith({}, 0, 20);
    });

    it('defaults page/limit when omitted from the query', async () => {
      (serviceProvidersRepository.findMany as jest.Mock).mockResolvedValue({ rows: [], total: 0 });

      const result = await serviceProvidersService.getServiceProviders({ city: 'Gaza' } as any);

      expect(result.meta).toEqual(expect.objectContaining({ page: 1, limit: 20 }));
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
