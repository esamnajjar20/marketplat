import { requestsService } from '../../src/modules/requests/requests.service';
import { requestsRepository, requestOffersRepository } from '../../src/modules/requests/requests.repository';
import { serviceCategoriesRepository } from '../../src/modules/service-categories/service-categories.repository';
import { productCategoriesRepository } from '../../src/modules/product-categories/product-categories.repository';
import { categoriesRepository } from '../../src/modules/categories/categories.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/modules/requests/requests.repository');
jest.mock('../../src/modules/service-categories/service-categories.repository');
jest.mock('../../src/modules/product-categories/product-categories.repository');
jest.mock('../../src/modules/categories/categories.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/modules/service-providers/service-providers.repository');
jest.mock('../../src/modules/conversations/conversations.service', () => ({
  conversationsService: { startFromUser: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock('../../src/config/prisma', () => ({
  prisma: {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    request: { findUniqueOrThrow: jest.fn() },
    requestOffer: { update: jest.fn() },
    serviceProviderServiceType: { findFirst: jest.fn() },
  },
}));

describe('requestsService.create category guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requestsRepository.countOpenByCustomer as jest.Mock).mockResolvedValue(0);
    (requestsRepository.create as jest.Mock).mockImplementation(async (_uid, data) => ({
      id: 'r1',
      ...data,
      status: 'OPEN',
    }));
  });

  it('rejects SERVICE with unknown category', async () => {
    (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue(null);
    await expect(
      requestsService.create('u1', {
        type: 'SERVICE',
        categoryId: 'missing',
        title: 'Need plumber',
        description: 'Kitchen sink is leaking badly',
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });


  it('inherits the ServiceType from the selected service category', async () => {
    (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue({
      id: 'sc1',
      isActive: true,
      serviceTypeId: 'st-digital',
    });
    await requestsService.create('u1', {
      type: 'SERVICE',
      categoryId: 'sc1',
      title: 'Need a logo designer',
      description: 'I need a professional logo for a small business',
    });
    expect(requestsRepository.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ serviceTypeId: 'st-digital' }),
    );
  });

  it('creates PRODUCT when product category exists', async () => {
    (productCategoriesRepository.findById as jest.Mock).mockResolvedValue({
      id: 'pc1',
      isActive: true,
    });
    const row = await requestsService.create('u1', {
      type: 'PRODUCT',
      categoryId: 'pc1',
      title: 'Want iPhone 15',
      description: 'Used 256GB in good condition please',
    });
    expect(row.id).toBe('r1');
    expect(requestsRepository.create).toHaveBeenCalled();
  });

  it('blocks when max open requests reached', async () => {
    (serviceCategoriesRepository.findById as jest.Mock).mockResolvedValue({ id: 'sc1', isActive: true });
    (requestsRepository.countOpenByCustomer as jest.Mock).mockResolvedValue(5);
    await expect(
      requestsService.create('u1', {
        type: 'SERVICE',
        categoryId: 'sc1',
        title: 'Need electrician',
        description: 'Apartment fuse keeps tripping daily',
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe('requestsService.submitOffer eligibility', () => {
  const openRequest = {
    id: 'req1',
    customerId: 'customer1',
    type: 'SERVICE' as const,
    status: 'OPEN' as const,
    expiresAt: new Date(Date.now() + 86400000),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (requestsRepository.findById as jest.Mock).mockResolvedValue(openRequest);
    (requestOffersRepository.findByRequestAndOfferer as jest.Mock).mockResolvedValue(null);
    (requestOffersRepository.create as jest.Mock).mockResolvedValue({ id: 'o1', status: 'PENDING' });
  });

  it('rejects SERVICE offer without provider profile', async () => {
    (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({ id: 'sp1' });
    (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue(null);
    await expect(
      requestsService.submitOffer('offerer1', 'req1', { price: 100 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });


  it('rejects a SERVICE offer when the provider does not support the request ServiceType', async () => {
    const prismaModule = prisma as unknown as { serviceProviderServiceType: { findFirst: jest.Mock } };
    (requestsRepository.findById as jest.Mock).mockResolvedValue({
      ...openRequest,
      serviceTypeId: 'st-digital',
    });
    (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({ id: 'sp1' });
    (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue({
      id: 'provider1',
      serviceAreaCities: ['غزة'],
    });
    prismaModule.serviceProviderServiceType.findFirst.mockResolvedValue(null);

    await expect(
      requestsService.submitOffer('offerer1', 'req1', { price: 100 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects PRODUCT offer without seller profile', async () => {
    (requestsRepository.findById as jest.Mock).mockResolvedValue({
      ...openRequest,
      type: 'PRODUCT',
    });
    (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
    await expect(
      requestsService.submitOffer('offerer1', 'req1', { price: 100 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
