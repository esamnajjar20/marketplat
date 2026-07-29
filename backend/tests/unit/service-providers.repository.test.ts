import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    serviceProviderDetails: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

const mockTx = {
  serviceProviderDetails: { create: jest.fn() },
} as any;

const providerId = 'provider-1';
const sellerProfileId = 'seller-profile-1';

describe('serviceProvidersRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findBySellerProfileId', () => {
    it('queries by sellerProfileId', async () => {
      (prisma.serviceProviderDetails.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceProvidersRepository.findBySellerProfileId(sellerProfileId);
      expect(prisma.serviceProviderDetails.findUnique).toHaveBeenCalledWith({
        where: { sellerProfileId },
      });
    });
  });

  describe('findById', () => {
    it('queries by id', async () => {
      (prisma.serviceProviderDetails.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceProvidersRepository.findById(providerId);
      expect(prisma.serviceProviderDetails.findUnique).toHaveBeenCalledWith({
        where: { id: providerId },
      });
    });
  });

  describe('findPublicById', () => {
    it('queries by id and includes sellerProfile', async () => {
      (prisma.serviceProviderDetails.findUnique as jest.Mock).mockResolvedValue(null);
      await serviceProvidersRepository.findPublicById(providerId);
      expect(prisma.serviceProviderDetails.findUnique).toHaveBeenCalledWith({
        where: { id: providerId },
        include: { sellerProfile: true },
      });
    });

    it('returns null when no provider matches', async () => {
      (prisma.serviceProviderDetails.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await serviceProvidersRepository.findPublicById('missing');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a provider with all fields under the transaction client', async () => {
      const data = {
        businessName: 'Acme Repairs',
        businessType: 'SMALL_BUSINESS' as const,
        logoUrl: 'https://example.com/logo.png',
        description: 'We fix things',
        serviceAreaCities: ['Gaza', 'Khan Younis'],
        workingHours: { sun: { open: '09:00', close: '18:00' }, mon: null } as any,
        contactPhone: '0599123456',
        latitude: 31.5,
        longitude: 34.45,
      };
      mockTx.serviceProviderDetails.create.mockResolvedValue({ id: providerId, ...data });

      await serviceProvidersRepository.create(mockTx, sellerProfileId, data);

      expect(mockTx.serviceProviderDetails.create).toHaveBeenCalledWith({
        data: {
          sellerProfileId,
          businessName: data.businessName,
          businessType: data.businessType,
          logoUrl: data.logoUrl,
          description: data.description,
          serviceAreaCities: data.serviceAreaCities,
          workingHours: data.workingHours,
          contactPhone: data.contactPhone,
          latitude: data.latitude,
          longitude: data.longitude,
        },
      });
    });

    it('creates a provider without optional logoUrl/latitude/longitude', async () => {
      const data = {
        businessName: 'Acme Repairs',
        businessType: 'INDIVIDUAL' as const,
        description: 'We fix things',
        serviceAreaCities: ['Gaza'],
        workingHours: { sun: null } as any,
        contactPhone: '0599123456',
      };
      mockTx.serviceProviderDetails.create.mockResolvedValue({ id: providerId, ...data });

      await serviceProvidersRepository.create(mockTx, sellerProfileId, data);

      expect(mockTx.serviceProviderDetails.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          sellerProfileId,
          logoUrl: undefined,
          latitude: undefined,
          longitude: undefined,
        }),
      });
    });
  });

  describe('update', () => {
    it('updates with the given partial data', async () => {
      (prisma.serviceProviderDetails.update as jest.Mock).mockResolvedValue({ id: providerId });
      await serviceProvidersRepository.update(providerId, { businessName: 'New Name' });
      expect(prisma.serviceProviderDetails.update).toHaveBeenCalledWith({
        where: { id: providerId },
        data: { businessName: 'New Name' },
      });
    });

    it('allows nulling out latitude/longitude', async () => {
      (prisma.serviceProviderDetails.update as jest.Mock).mockResolvedValue({ id: providerId });
      await serviceProvidersRepository.update(providerId, { latitude: null, longitude: null });
      expect(prisma.serviceProviderDetails.update).toHaveBeenCalledWith({
        where: { id: providerId },
        data: { latitude: null, longitude: null },
      });
    });

    it('updates availabilityStatus', async () => {
      (prisma.serviceProviderDetails.update as jest.Mock).mockResolvedValue({ id: providerId });
      await serviceProvidersRepository.update(providerId, { availabilityStatus: 'BUSY' });
      expect(prisma.serviceProviderDetails.update).toHaveBeenCalledWith({
        where: { id: providerId },
        data: { availabilityStatus: 'BUSY' },
      });
    });
  });

  describe('findNearby', () => {
    it('runs the distance + count queries and re-hydrates rows via findMany, preserving distance order', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          { id: 'p1', distanceKm: 1.2 },
          { id: 'p2', distanceKm: 3.4 },
        ])
        .mockResolvedValueOnce([{ count: 2n }]);
      (prisma.serviceProviderDetails.findMany as jest.Mock).mockResolvedValue([
        { id: 'p2', businessName: 'Far' },
        { id: 'p1', businessName: 'Near' },
      ]);

      const result = await serviceProvidersRepository.findNearby(31.5, 34.45, 10, 0, 20);

      expect(result.total).toBe(2);
      // Order follows the distance-ranked idRows, not findMany's return order.
      expect(result.rows.map(r => r.id)).toEqual(['p1', 'p2']);
      expect(result.rows[0].distanceKm).toBe(1.2);
      expect(result.rows[1].distanceKm).toBe(3.4);
      expect(prisma.serviceProviderDetails.findMany).toHaveBeenCalledWith({
        where: { id: { in: ['p1', 'p2'] } },
      });
    });

    it('returns an empty result without calling findMany when no rows are within range', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: 0n }]);

      const result = await serviceProvidersRepository.findNearby(31.5, 34.45, 10, 0, 20);

      expect(result).toEqual({ rows: [], total: 0 });
      expect(prisma.serviceProviderDetails.findMany).not.toHaveBeenCalled();
    });

    it('handles a missing/empty count result by defaulting total to 0', async () => {
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await serviceProvidersRepository.findNearby(31.5, 34.45, 10, 0, 20);

      expect(result).toEqual({ rows: [], total: 0 });
    });

    it('drops idRows entries that findMany does not return (row deleted between the two queries)', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          { id: 'p1', distanceKm: 1.2 },
          { id: 'p2', distanceKm: 3.4 },
        ])
        .mockResolvedValueOnce([{ count: 2n }]);
      // p2 vanished between the raw query and the typed findMany.
      (prisma.serviceProviderDetails.findMany as jest.Mock).mockResolvedValue([
        { id: 'p1', businessName: 'Near' },
      ]);

      const result = await serviceProvidersRepository.findNearby(31.5, 34.45, 10, 0, 20);

      expect(result.rows.map(r => r.id)).toEqual(['p1']);
      expect(result.total).toBe(2);
    });

    it('falls back to the raw row distanceKm if the id-to-distance map lookup misses', async () => {
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([{ id: 'p1', distanceKm: 5.5 }])
        .mockResolvedValueOnce([{ count: 1n }]);
      (prisma.serviceProviderDetails.findMany as jest.Mock).mockResolvedValue([
        { id: 'p1', businessName: 'Near' },
      ]);

      const result = await serviceProvidersRepository.findNearby(31.5, 34.45, 10, 0, 20);

      expect(result.rows[0].distanceKm).toBe(5.5);
    });
  });
});
