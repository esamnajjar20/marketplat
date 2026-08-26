import {
  serviceBroadcastsRepository,
  serviceQuotesRepository,
} from '../../src/modules/service-broadcasts/service-broadcasts.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    serviceRequestBroadcast: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    serviceQuote: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe('serviceBroadcastsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('create maps attachedImages default', async () => {
    (prisma.serviceRequestBroadcast.create as jest.Mock).mockResolvedValue({ id: 'b1' });
    await serviceBroadcastsRepository.create('user-1', {
      categoryId: 'cat-1',
      title: 'title long enough',
      description: 'description long enough',
      city: 'غزة',
    });
    expect(prisma.serviceRequestBroadcast.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        customerId: 'user-1',
        attachedImages: [],
      }),
    });
  });

  it('findById includes relations', async () => {
    (prisma.serviceRequestBroadcast.findUnique as jest.Mock).mockResolvedValue(null);
    await serviceBroadcastsRepository.findById('b1');
    expect(prisma.serviceRequestBroadcast.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b1' }, include: expect.any(Object) }),
    );
  });

  it('findOpenFeed filters OPEN and optional city/category', async () => {
    (prisma.serviceRequestBroadcast.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.serviceRequestBroadcast.count as jest.Mock).mockResolvedValue(0);
    const result = await serviceBroadcastsRepository.findOpenFeed({
      page: 1,
      limit: 10,
      categoryId: 'c1',
      city: 'غزة',
    });
    expect(result).toEqual({ broadcasts: [], total: 0 });
    expect(prisma.serviceRequestBroadcast.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'OPEN', categoryId: 'c1', city: 'غزة' },
      }),
    );
  });

  it('findManyByCustomerId pages results', async () => {
    (prisma.serviceRequestBroadcast.findMany as jest.Mock).mockResolvedValue([{ id: 'b1' }]);
    (prisma.serviceRequestBroadcast.count as jest.Mock).mockResolvedValue(1);
    const result = await serviceBroadcastsRepository.findManyByCustomerId('u1', {
      page: 1,
      limit: 20,
    });
    expect(result.total).toBe(1);
    expect(result.broadcasts).toHaveLength(1);
  });

  it('cancel and markAccepted', async () => {
    (prisma.serviceRequestBroadcast.update as jest.Mock).mockResolvedValue({ id: 'b1' });
    await serviceBroadcastsRepository.cancel('b1');
    expect(prisma.serviceRequestBroadcast.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { status: 'CANCELLED' },
    });

    const tx = { serviceRequestBroadcast: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    await serviceBroadcastsRepository.markAccepted(tx as any, 'b1', 'q1');
    expect(tx.serviceRequestBroadcast.updateMany).toHaveBeenCalledWith({
      where: { id: 'b1', status: 'OPEN' },
      data: { status: 'ACCEPTED', acceptedQuoteId: 'q1' },
    });
  });
});

describe('serviceQuotesRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('create / findById / findByBroadcastAndProvider', async () => {
    (prisma.serviceQuote.create as jest.Mock).mockResolvedValue({ id: 'q1' });
    (prisma.serviceQuote.findUnique as jest.Mock).mockResolvedValue(null);
    await serviceQuotesRepository.create('b1', 'p1', { price: 50, message: 'hi' });
    await serviceQuotesRepository.findById('q1');
    await serviceQuotesRepository.findByBroadcastAndProvider('b1', 'p1');
    expect(prisma.serviceQuote.create).toHaveBeenCalled();
  });

  it('update / withdraw', async () => {
    (prisma.serviceQuote.update as jest.Mock).mockResolvedValue({ id: 'q1' });
    await serviceQuotesRepository.update('q1', { price: 60 });
    await serviceQuotesRepository.withdraw('q1');
    expect(prisma.serviceQuote.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { status: 'WITHDRAWN' },
    });
  });

  it('accept and declineOthers via transaction client', async () => {
    const tx = {
      serviceQuote: {
        update: jest.fn().mockResolvedValue({ id: 'q1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    await serviceQuotesRepository.accept(tx as any, 'q1');
    await serviceQuotesRepository.declineOthers(tx as any, 'b1', 'q1');
    expect(tx.serviceQuote.updateMany).toHaveBeenCalledWith({
      where: { broadcastId: 'b1', id: { not: 'q1' }, status: 'PENDING' },
      data: { status: 'DECLINED' },
    });
  });

  it('findManyByProviderId pages results', async () => {
    (prisma.serviceQuote.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.serviceQuote.count as jest.Mock).mockResolvedValue(0);
    const result = await serviceQuotesRepository.findManyByProviderId('p1', {
      page: 2,
      limit: 10,
    });
    expect(result).toEqual({ quotes: [], total: 0 });
  });
});
