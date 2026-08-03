import { serviceRequestsRepository } from '../../src/modules/service-requests/service-requests.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    serviceRequest: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockTx = {
  serviceRequest: {
    create: jest.fn(),
    updateMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
} as any;

const requestId = 'request-1';
const customerId = 'customer-1';
const listingId = 'listing-1';
const providerId = 'provider-1';

describe('serviceRequestsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('creates a request with details and attachedImages under the transaction client', async () => {
      mockTx.serviceRequest.create.mockResolvedValue({ id: requestId });

      await serviceRequestsRepository.create(mockTx, customerId, listingId, {
        details: 'Please fix my sink',
        attachedImages: ['https://example.com/img.jpg'],
      });

      expect(mockTx.serviceRequest.create).toHaveBeenCalledWith({
        data: {
          customerId,
          listingId,
          details: 'Please fix my sink',
          attachedImages: ['https://example.com/img.jpg'],
        },
      });
    });

    it('creates a request with an empty attachedImages array', async () => {
      mockTx.serviceRequest.create.mockResolvedValue({ id: requestId });

      await serviceRequestsRepository.create(mockTx, customerId, listingId, {
        details: 'Please fix my sink',
        attachedImages: [],
      });

      expect(mockTx.serviceRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ attachedImages: [] }),
      });
    });
  });

  describe('findById', () => {
    it('queries by id with listing/provider/sellerProfile/customer relations included', async () => {
      (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceRequestsRepository.findById(requestId);
      expect(prisma.serviceRequest.findUnique).toHaveBeenCalledWith({
        where: { id: requestId },
        include: {
          listing: { include: { provider: { include: { sellerProfile: true } } } },
          customer: { select: { id: true, name: true, avatarUrl: true } },
          review: { select: { id: true } },
        },
      });
    });

    it('returns null when no request matches', async () => {
      (prisma.serviceRequest.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await serviceRequestsRepository.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('transitionStatus', () => {
    it('conditionally updates matching id+status, setting respondedAt', async () => {
      mockTx.serviceRequest.updateMany.mockResolvedValue({ count: 1 });

      await serviceRequestsRepository.transitionStatus(mockTx, requestId, 'PENDING', 'ACCEPTED');

      expect(mockTx.serviceRequest.updateMany).toHaveBeenCalledWith({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'ACCEPTED', respondedAt: expect.any(Date) },
      });
    });

    it('includes quotedPrice when provided', async () => {
      mockTx.serviceRequest.updateMany.mockResolvedValue({ count: 1 });

      await serviceRequestsRepository.transitionStatus(mockTx, requestId, 'PENDING', 'ACCEPTED', {
        quotedPrice: 150.5,
      });

      expect(mockTx.serviceRequest.updateMany).toHaveBeenCalledWith({
        where: { id: requestId, status: 'PENDING' },
        data: { status: 'ACCEPTED', respondedAt: expect.any(Date), quotedPrice: 150.5 },
      });
    });

    it('includes agreedPrice when provided', async () => {
      mockTx.serviceRequest.updateMany.mockResolvedValue({ count: 1 });

      await serviceRequestsRepository.transitionStatus(mockTx, requestId, 'IN_PROGRESS', 'COMPLETED', {
        agreedPrice: 200,
      });

      expect(mockTx.serviceRequest.updateMany).toHaveBeenCalledWith({
        where: { id: requestId, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED', respondedAt: expect.any(Date), agreedPrice: 200 },
      });
    });

    it('omits quotedPrice/agreedPrice from the data payload when not provided', async () => {
      mockTx.serviceRequest.updateMany.mockResolvedValue({ count: 1 });

      await serviceRequestsRepository.transitionStatus(mockTx, requestId, 'PENDING', 'CANCELLED');

      const callArgs = mockTx.serviceRequest.updateMany.mock.calls[0][0];
      expect(callArgs.data).not.toHaveProperty('quotedPrice');
      expect(callArgs.data).not.toHaveProperty('agreedPrice');
    });

    it('returns a count of 0 when the row no longer matches the expected status', async () => {
      mockTx.serviceRequest.updateMany.mockResolvedValue({ count: 0 });

      const result = await serviceRequestsRepository.transitionStatus(
        mockTx,
        requestId,
        'PENDING',
        'ACCEPTED'
      );

      expect(result.count).toBe(0);
    });
  });

  describe('findManyByCustomerId', () => {
    it('applies default pagination and no status filter when omitted', async () => {
      (prisma.serviceRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.serviceRequest.count as jest.Mock).mockResolvedValue(0);

      await serviceRequestsRepository.findManyByCustomerId(customerId, {});

      expect(prisma.serviceRequest.findMany).toHaveBeenCalledWith({
        where: { customerId },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.serviceRequest.count).toHaveBeenCalledWith({ where: { customerId } });
    });

    it('applies a status filter and custom pagination when provided', async () => {
      (prisma.serviceRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.serviceRequest.count as jest.Mock).mockResolvedValue(0);

      await serviceRequestsRepository.findManyByCustomerId(customerId, {
        page: 2,
        limit: 10,
        status: 'ACCEPTED',
      });

      expect(prisma.serviceRequest.findMany).toHaveBeenCalledWith({
        where: { customerId, status: 'ACCEPTED' },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 10,
      });
    });

    it('returns requests and total from the parallel queries', async () => {
      const requests = [{ id: 'r1' }, { id: 'r2' }];
      (prisma.serviceRequest.findMany as jest.Mock).mockResolvedValue(requests);
      (prisma.serviceRequest.count as jest.Mock).mockResolvedValue(2);

      const result = await serviceRequestsRepository.findManyByCustomerId(customerId, {});

      expect(result).toEqual({ requests, total: 2 });
    });
  });

  describe('findManyByProviderId', () => {
    it('filters by listing.providerId with default pagination', async () => {
      (prisma.serviceRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.serviceRequest.count as jest.Mock).mockResolvedValue(0);

      await serviceRequestsRepository.findManyByProviderId(providerId, {});

      expect(prisma.serviceRequest.findMany).toHaveBeenCalledWith({
        where: { listing: { providerId } },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(prisma.serviceRequest.count).toHaveBeenCalledWith({
        where: { listing: { providerId } },
      });
    });

    it('applies a status filter and custom pagination when provided', async () => {
      (prisma.serviceRequest.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.serviceRequest.count as jest.Mock).mockResolvedValue(0);

      await serviceRequestsRepository.findManyByProviderId(providerId, {
        page: 3,
        limit: 5,
        status: 'PENDING',
      });

      expect(prisma.serviceRequest.findMany).toHaveBeenCalledWith({
        where: { listing: { providerId }, status: 'PENDING' },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        skip: 10,
        take: 5,
      });
    });

    it('returns requests and total from the parallel queries', async () => {
      const requests = [{ id: 'r1' }];
      (prisma.serviceRequest.findMany as jest.Mock).mockResolvedValue(requests);
      (prisma.serviceRequest.count as jest.Mock).mockResolvedValue(1);

      const result = await serviceRequestsRepository.findManyByProviderId(providerId, {});

      expect(result).toEqual({ requests, total: 1 });
    });
  });
});
