import { serviceRequestsService } from '../../src/modules/service-requests/service-requests.service';
import { serviceRequestsRepository } from '../../src/modules/service-requests/service-requests.repository';
import { serviceListingsRepository } from '../../src/modules/service-listings/service-listings.repository';
import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { prisma } from '../../src/config/prisma';
import { notificationEvents } from '../../src/modules/notifications/notifications.service';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ConflictError } from '../../src/shared/errors/ConflictError';

jest.mock('../../src/modules/service-requests/service-requests.repository');
jest.mock('../../src/modules/service-listings/service-listings.repository');
jest.mock('../../src/modules/service-providers/service-providers.repository');
jest.mock('../../src/modules/notifications/notifications.service', () => ({
  notificationEvents: {
    onServiceRequestCreated: jest.fn(),
    onServiceRequestStatusChanged: jest.fn(),
    onAppointmentChanged: jest.fn(),
  },
}));

const mockListing = {
  id: 'listing-1',
  providerId: 'provider-1',
  title: 'Plumbing',
  status: 'ACTIVE',
};

const mockProvider = {
  id: 'provider-1',
  sellerProfile: { userId: 'seller-user-1' },
};

describe('ServiceRequestsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Re-armed every test: restoreAllMocks/clearAllMocks in this suite can
    // drop the resolved value, and the services call .catch() on the result.
    (notificationEvents.onServiceRequestCreated as jest.Mock).mockResolvedValue(null);
    (notificationEvents.onServiceRequestStatusChanged as jest.Mock).mockResolvedValue(null);
    (notificationEvents.onAppointmentChanged as jest.Mock).mockResolvedValue(null);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('createRequest — self-dealing guard (audit finding #1)', () => {
    it('rejects a request where the customer is the listing owner', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(mockProvider);

      // The would-be customer IS the provider's own userId.
      await expect(
        serviceRequestsService.createRequest('seller-user-1', {
          listingId: 'listing-1',
          details: 'test',
        } as any)
      ).rejects.toThrow(ForbiddenError);

      expect(serviceRequestsRepository.create).not.toHaveBeenCalled();
    });

    it('allows a request from a genuinely different customer', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(mockProvider);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb({}) as any);
      (serviceRequestsRepository.create as jest.Mock).mockResolvedValue({ id: 'req-1' });

      const result = await serviceRequestsService.createRequest('customer-user-2', {
        listingId: 'listing-1',
        details: 'test',
      } as any);

      expect(result).toEqual({ id: 'req-1' });
      expect(serviceRequestsRepository.create).toHaveBeenCalledWith(
        expect.anything(),
        'customer-user-2',
        'listing-1',
        expect.objectContaining({ details: 'test' })
      );
    });

    it('notifies the provider (not the customer) that a new request arrived', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(mockProvider);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb({}) as any);
      (serviceRequestsRepository.create as jest.Mock).mockResolvedValue({ id: 'req-1' });

      await serviceRequestsService.createRequest('customer-user-2', {
        listingId: 'listing-1',
        details: 'test',
      } as any);

      expect(notificationEvents.onServiceRequestCreated).toHaveBeenCalledWith(
        'seller-user-1',
        'req-1',
        'Plumbing',
        'customer-user-2'
      );
    });

    it('still creates the request when the notification fails', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(mockProvider);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb({}) as any);
      (serviceRequestsRepository.create as jest.Mock).mockResolvedValue({ id: 'req-1' });
      (notificationEvents.onServiceRequestCreated as jest.Mock).mockRejectedValue(new Error('push down'));

      await expect(
        serviceRequestsService.createRequest('customer-user-2', { listingId: 'listing-1', details: 'test' } as any)
      ).resolves.toEqual({ id: 'req-1' });
    });

    it('still rejects self-dealing even if the provider lookup omits sellerProfile mismatch by ID rather than userId', async () => {
      // Guards against a regression where the check compares provider IDs
      // instead of the actual underlying userId.
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue({
        id: 'provider-1',
        sellerProfile: { userId: 'seller-user-1' },
      });

      await expect(
        serviceRequestsService.createRequest('seller-user-1', {
          listingId: 'listing-1',
          details: 'anything',
        } as any)
      ).rejects.toThrow('You cannot request your own service listing.');
    });

    it('rejects when the listing does not exist or is not active', async () => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(
        serviceRequestsService.createRequest('customer-1', {
          listingId: 'missing',
          details: 'test',
        } as any)
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('createRequest — duplicate open request guard (audit H4)', () => {
    beforeEach(() => {
      (serviceListingsRepository.findById as jest.Mock).mockResolvedValue(mockListing);
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue(mockProvider);
    });

    it('rejects a second request while one is still open for the same listing', async () => {
      (serviceRequestsRepository.findOpenByCustomerAndListing as jest.Mock).mockResolvedValue({
        id: 'req-old',
        status: 'PENDING',
      });

      await expect(
        serviceRequestsService.createRequest('customer-user-2', { listingId: 'listing-1', details: 'again' } as any)
      ).rejects.toThrow(ConflictError);

      expect(serviceRequestsRepository.create).not.toHaveBeenCalled();
    });

    it('checks by (customer, listing) so a different customer is unaffected', async () => {
      (serviceRequestsRepository.findOpenByCustomerAndListing as jest.Mock).mockResolvedValue(null);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => cb({}) as any);
      (serviceRequestsRepository.create as jest.Mock).mockResolvedValue({ id: 'req-2' });

      await serviceRequestsService.createRequest('customer-user-3', { listingId: 'listing-1', details: 'x' } as any);

      expect(serviceRequestsRepository.findOpenByCustomerAndListing).toHaveBeenCalledWith(
        'customer-user-3',
        'listing-1'
      );
      expect(serviceRequestsRepository.create).toHaveBeenCalled();
    });
  });

  describe('getRequestById — two-party authorization', () => {
    const mockRequest = {
      id: 'req-1',
      customerId: 'customer-1',
      listing: { provider: { sellerProfile: { userId: 'seller-user-1' } } },
    };

    it('allows the customer to view their own request', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockRequest);
      const result = await serviceRequestsService.getRequestById('customer-1', 'req-1');
      expect(result).toEqual(mockRequest);
    });

    it('allows the provider to view a request against their listing', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockRequest);
      const result = await serviceRequestsService.getRequestById('seller-user-1', 'req-1');
      expect(result).toEqual(mockRequest);
    });

    it('rejects an unrelated third party (IDOR check)', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(mockRequest);
      await expect(
        serviceRequestsService.getRequestById('random-other-user', 'req-1')
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError for a nonexistent request', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(serviceRequestsService.getRequestById('customer-1', 'missing')).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
