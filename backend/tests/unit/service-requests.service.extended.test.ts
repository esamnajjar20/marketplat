import { serviceRequestsService } from '../../src/modules/service-requests/service-requests.service';
import { serviceRequestsRepository } from '../../src/modules/service-requests/service-requests.repository';
import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { prisma } from '../../src/config/prisma';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { ConflictError } from '../../src/shared/errors/ConflictError';

jest.mock('../../src/modules/service-requests/service-requests.repository');
jest.mock('../../src/modules/service-providers/service-providers.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/config/prisma', () => ({
  prisma: { $transaction: jest.fn() },
}));

const customerId = 'customer-1';
const providerUserId = 'provider-user-1';
const requestId = 'request-1';

const buildRequest = (overrides: Partial<any> = {}) => ({
  id: requestId,
  customerId,
  status: 'PENDING',
  listing: {
    id: 'listing-1',
    provider: { id: 'provider-1', sellerProfile: { id: 'seller-profile-1', userId: providerUserId } },
  },
  ...overrides,
});

describe('serviceRequestsService — additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb({}));
  });

  describe('getMyRequestsAsCustomer', () => {
    it('returns items with pagination meta built from total/page/limit', async () => {
      const requests = [buildRequest()];
      (serviceRequestsRepository.findManyByCustomerId as jest.Mock).mockResolvedValue({
        requests,
        total: 1,
      });

      const result = await serviceRequestsService.getMyRequestsAsCustomer(customerId, {} as any);

      expect(result.items).toEqual(requests);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 1, page: 1, limit: 20, totalPages: 1 })
      );
    });

    it('passes through explicit page/limit/status filters to the repository', async () => {
      (serviceRequestsRepository.findManyByCustomerId as jest.Mock).mockResolvedValue({
        requests: [],
        total: 0,
      });

      await serviceRequestsService.getMyRequestsAsCustomer(customerId, {
        page: 2,
        limit: 5,
        status: 'COMPLETED',
      } as any);

      expect(serviceRequestsRepository.findManyByCustomerId).toHaveBeenCalledWith(customerId, {
        page: 2,
        limit: 5,
        status: 'COMPLETED',
      });
    });

    it('computes multi-page totalPages/hasNextPage correctly', async () => {
      (serviceRequestsRepository.findManyByCustomerId as jest.Mock).mockResolvedValue({
        requests: [],
        total: 45,
      });

      const result = await serviceRequestsService.getMyRequestsAsCustomer(customerId, {
        page: 1,
        limit: 20,
      } as any);

      expect(result.meta).toEqual(
        expect.objectContaining({ total: 45, totalPages: 3, hasNextPage: true, hasPrevPage: false })
      );
    });
  });

  describe('getMyRequestsAsProvider', () => {
    it('throws NotFoundError when the user has no seller profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      await expect(
        serviceRequestsService.getMyRequestsAsProvider(providerUserId, {} as any)
      ).rejects.toThrow('Seller profile not found');
      expect(serviceProvidersRepository.findBySellerProfileId).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when the seller has no provider profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({ id: 'seller-profile-1' });
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
      await expect(
        serviceRequestsService.getMyRequestsAsProvider(providerUserId, {} as any)
      ).rejects.toThrow('Service provider profile not found');
    });

    it('returns items with pagination meta when the provider profile exists', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({ id: 'seller-profile-1' });
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue({
        id: 'provider-1',
      });
      const requests = [buildRequest()];
      (serviceRequestsRepository.findManyByProviderId as jest.Mock).mockResolvedValue({
        requests,
        total: 1,
      });

      const result = await serviceRequestsService.getMyRequestsAsProvider(providerUserId, {} as any);

      expect(serviceRequestsRepository.findManyByProviderId).toHaveBeenCalledWith('provider-1', {});
      expect(result.items).toEqual(requests);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('respondToRequest', () => {
    it('throws NotFoundError when the request does not exist', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(
        serviceRequestsService.respondToRequest(providerUserId, requestId, 'ACCEPTED')
      ).rejects.toThrow('Service request not found');
    });

    it('throws ForbiddenError when the caller is neither customer nor provider', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(buildRequest());
      await expect(
        serviceRequestsService.respondToRequest('stranger', requestId, 'ACCEPTED')
      ).rejects.toThrow('You do not have permission to act on this request.');
    });

    it('throws ConflictError when the transition is not legal for the current status', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(
        buildRequest({ status: 'COMPLETED' })
      );
      await expect(
        serviceRequestsService.respondToRequest(providerUserId, requestId, 'ACCEPTED')
      ).rejects.toThrow('Cannot transition from COMPLETED to ACCEPTED');
    });

    it('rejects any transition attempt from a terminal state (REJECTED has no allowed transitions)', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(
        buildRequest({ status: 'REJECTED' })
      );
      await expect(
        serviceRequestsService.respondToRequest(providerUserId, requestId, 'ACCEPTED')
      ).rejects.toThrow(ConflictError);
    });

    it('throws ForbiddenError when the customer attempts a provider-only transition (PENDING->ACCEPTED)', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(buildRequest());
      await expect(
        serviceRequestsService.respondToRequest(customerId, requestId, 'ACCEPTED')
      ).rejects.toThrow('Only the service provider can perform this action.');
    });

    it('throws ForbiddenError when the customer attempts PENDING->REJECTED (provider-only)', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(buildRequest());
      await expect(
        serviceRequestsService.respondToRequest(customerId, requestId, 'REJECTED')
      ).rejects.toThrow('Only the service provider can perform this action.');
    });

    it('throws ForbiddenError when the provider attempts a customer-only transition (PENDING->CANCELLED)', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(buildRequest());
      await expect(
        serviceRequestsService.respondToRequest(providerUserId, requestId, 'CANCELLED')
      ).rejects.toThrow('Only the customer can perform this action.');
    });

    it('throws ForbiddenError when the provider attempts IN_PROGRESS->COMPLETED as the customer', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(
        buildRequest({ status: 'IN_PROGRESS' })
      );
      await expect(
        serviceRequestsService.respondToRequest(customerId, requestId, 'COMPLETED')
      ).rejects.toThrow('Only the service provider can perform this action.');
    });

    it('allows the provider to accept a PENDING request', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(buildRequest());
      (serviceRequestsRepository.transitionStatus as jest.Mock).mockResolvedValue({ count: 1 });
      const updated = buildRequest({ status: 'ACCEPTED' });
      const mockTx = { serviceRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(updated) } };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(mockTx));

      const result = await serviceRequestsService.respondToRequest(providerUserId, requestId, 'ACCEPTED');

      expect(result).toEqual(updated);
      expect(serviceRequestsRepository.transitionStatus).toHaveBeenCalledWith(
        mockTx,
        requestId,
        'PENDING',
        'ACCEPTED',
        undefined
      );
    });

    it('allows the customer to cancel from ACCEPTED (either-party transition)', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(
        buildRequest({ status: 'ACCEPTED' })
      );
      (serviceRequestsRepository.transitionStatus as jest.Mock).mockResolvedValue({ count: 1 });
      const updated = buildRequest({ status: 'CANCELLED' });
      const mockTx = { serviceRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(updated) } };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(mockTx));

      const result = await serviceRequestsService.respondToRequest(customerId, requestId, 'CANCELLED');
      expect(result).toEqual(updated);
    });

    it('allows the provider to cancel from IN_PROGRESS (either-party transition)', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(
        buildRequest({ status: 'IN_PROGRESS' })
      );
      (serviceRequestsRepository.transitionStatus as jest.Mock).mockResolvedValue({ count: 1 });
      const updated = buildRequest({ status: 'CANCELLED' });
      const mockTx = { serviceRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(updated) } };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(mockTx));

      const result = await serviceRequestsService.respondToRequest(
        providerUserId,
        requestId,
        'CANCELLED'
      );
      expect(result).toEqual(updated);
    });

    it('allows the provider to move IN_PROGRESS -> COMPLETED, forwarding an agreedPrice', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(
        buildRequest({ status: 'IN_PROGRESS' })
      );
      (serviceRequestsRepository.transitionStatus as jest.Mock).mockResolvedValue({ count: 1 });
      const updated = buildRequest({ status: 'COMPLETED', agreedPrice: 150 });
      const mockTx = { serviceRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(updated) } };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(mockTx));

      const result = await serviceRequestsService.respondToRequest(
        providerUserId,
        requestId,
        'COMPLETED',
        { agreedPrice: 150 }
      );

      expect(result).toEqual(updated);
      expect(serviceRequestsRepository.transitionStatus).toHaveBeenCalledWith(
        mockTx,
        requestId,
        'IN_PROGRESS',
        'COMPLETED',
        { agreedPrice: 150 }
      );
    });

    it('forwards a quotedPrice through to transitionStatus on PENDING->ACCEPTED', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(buildRequest());
      (serviceRequestsRepository.transitionStatus as jest.Mock).mockResolvedValue({ count: 1 });
      const updated = buildRequest({ status: 'ACCEPTED', quotedPrice: 99.99 });
      const mockTx = { serviceRequest: { findUniqueOrThrow: jest.fn().mockResolvedValue(updated) } };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(mockTx));

      await serviceRequestsService.respondToRequest(providerUserId, requestId, 'ACCEPTED', {
        quotedPrice: 99.99,
      });

      expect(serviceRequestsRepository.transitionStatus).toHaveBeenCalledWith(
        mockTx,
        requestId,
        'PENDING',
        'ACCEPTED',
        { quotedPrice: 99.99, agreedPrice: undefined }
      );
    });

    it('throws ConflictError when the conditional update matches zero rows (concurrent status change)', async () => {
      (serviceRequestsRepository.findById as jest.Mock).mockResolvedValue(buildRequest());
      (serviceRequestsRepository.transitionStatus as jest.Mock).mockResolvedValue({ count: 0 });
      const mockTx = { serviceRequest: { findUniqueOrThrow: jest.fn() } };
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb: any) => cb(mockTx));

      await expect(
        serviceRequestsService.respondToRequest(providerUserId, requestId, 'ACCEPTED')
      ).rejects.toThrow('Request status has changed — please refresh and try again');
      expect(mockTx.serviceRequest.findUniqueOrThrow).not.toHaveBeenCalled();
    });
  });
});
