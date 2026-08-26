/**
 * service-broadcasts.service — previously 0 unit coverage.
 */
import { serviceBroadcastsService } from '../../src/modules/service-broadcasts/service-broadcasts.service';
import {
  serviceBroadcastsRepository,
  serviceQuotesRepository,
} from '../../src/modules/service-broadcasts/service-broadcasts.repository';
import { sellersRepository } from '../../src/modules/sellers/sellers.repository';
import { serviceProvidersRepository } from '../../src/modules/service-providers/service-providers.repository';
import { conversationsService } from '../../src/modules/conversations/conversations.service';
import { notificationEvents } from '../../src/modules/notifications';
import { prisma } from '../../src/config/prisma';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { ConflictError } from '../../src/shared/errors/ConflictError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/service-broadcasts/service-broadcasts.repository');
jest.mock('../../src/modules/sellers/sellers.repository');
jest.mock('../../src/modules/service-providers/service-providers.repository');
jest.mock('../../src/modules/conversations/conversations.service', () => ({
  conversationsService: { startFromUser: jest.fn().mockResolvedValue({}) },
}));
jest.mock('../../src/modules/notifications', () => ({
  notificationEvents: {
    onNewServiceQuote: jest.fn().mockResolvedValue(undefined),
    onServiceQuoteAccepted: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../src/config/prisma', () => ({
  prisma: { $transaction: jest.fn() },
}));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const openBroadcast = {
  id: 'b1',
  customerId: 'customer-1',
  status: 'OPEN',
  title: 'Need plumber',
};

describe('serviceBroadcastsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('create / feeds / getById', () => {
    it('create delegates to repository', async () => {
      (serviceBroadcastsRepository.create as jest.Mock).mockResolvedValue({ id: 'b1' });
      const result = await serviceBroadcastsService.create('customer-1', {
        title: 'Help',
      } as any);
      expect(result.id).toBe('b1');
      expect(serviceBroadcastsRepository.create).toHaveBeenCalledWith('customer-1', {
        title: 'Help',
      });
    });

    it('getOpenFeed returns paginated items', async () => {
      (serviceBroadcastsRepository.findOpenFeed as jest.Mock).mockResolvedValue({
        broadcasts: [{ id: 'b1' }],
        total: 1,
      });
      const result = await serviceBroadcastsService.getOpenFeed({ page: 1, limit: 10 } as any);
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('getMyBroadcasts scopes to customer', async () => {
      (serviceBroadcastsRepository.findManyByCustomerId as jest.Mock).mockResolvedValue({
        broadcasts: [],
        total: 0,
      });
      const result = await serviceBroadcastsService.getMyBroadcasts('customer-1', {} as any);
      expect(result.items).toEqual([]);
      expect(serviceBroadcastsRepository.findManyByCustomerId).toHaveBeenCalledWith(
        'customer-1',
        {},
      );
    });

    it('getById throws NotFound when missing', async () => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(serviceBroadcastsService.getById('missing')).rejects.toThrow(NotFoundError);
    });

    it('getById returns broadcast without ownership check', async () => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue(openBroadcast);
      const result = await serviceBroadcastsService.getById('b1');
      expect(result).toEqual(openBroadcast);
    });
  });

  describe('cancel', () => {
    it('throws when not the customer', async () => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue(openBroadcast);
      await expect(serviceBroadcastsService.cancel('other', 'b1')).rejects.toThrow(ForbiddenError);
    });

    it('throws when not OPEN', async () => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue({
        ...openBroadcast,
        status: 'CANCELLED',
      });
      await expect(serviceBroadcastsService.cancel('customer-1', 'b1')).rejects.toThrow(
        ConflictError,
      );
    });

    it('cancels an open broadcast owned by the caller', async () => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue(openBroadcast);
      (serviceBroadcastsRepository.cancel as jest.Mock).mockResolvedValue({
        ...openBroadcast,
        status: 'CANCELLED',
      });
      const result = await serviceBroadcastsService.cancel('customer-1', 'b1');
      expect(result.status).toBe('CANCELLED');
    });
  });

  describe('submitQuote', () => {
    beforeEach(() => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue(openBroadcast);
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({ id: 'seller-1' });
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue({
        id: 'provider-1',
      });
    });

    it('throws when broadcast is closed', async () => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue({
        ...openBroadcast,
        status: 'ACCEPTED',
      });
      await expect(
        serviceBroadcastsService.submitQuote('provider-user', 'b1', { price: 100 } as any),
      ).rejects.toThrow(ConflictError);
    });

    it('throws when customer quotes on own broadcast', async () => {
      await expect(
        serviceBroadcastsService.submitQuote('customer-1', 'b1', { price: 100 } as any),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws when caller has no provider profile', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue(null);
      await expect(
        serviceBroadcastsService.submitQuote('provider-user', 'b1', { price: 100 } as any),
      ).rejects.toThrow(NotFoundError);
    });

    it('creates a new quote and notifies the customer', async () => {
      (serviceQuotesRepository.findByBroadcastAndProvider as jest.Mock).mockResolvedValue(null);
      (serviceQuotesRepository.create as jest.Mock).mockResolvedValue({ id: 'q1' });
      (serviceProvidersRepository.findPublicById as jest.Mock).mockResolvedValue({
        id: 'provider-1',
        sellerProfile: { displayName: 'أحمد' },
      });

      const quote = await serviceBroadcastsService.submitQuote('provider-user', 'b1', {
        price: 150,
      } as any);

      expect(quote.id).toBe('q1');
      expect(serviceQuotesRepository.create).toHaveBeenCalled();
      expect(notificationEvents.onNewServiceQuote).toHaveBeenCalled();
    });

    it('updates an existing quote without re-notifying', async () => {
      (serviceQuotesRepository.findByBroadcastAndProvider as jest.Mock).mockResolvedValue({
        id: 'q1',
      });
      (serviceQuotesRepository.update as jest.Mock).mockResolvedValue({ id: 'q1', price: 200 });

      await serviceBroadcastsService.submitQuote('provider-user', 'b1', { price: 200 } as any);

      expect(serviceQuotesRepository.update).toHaveBeenCalled();
      expect(serviceQuotesRepository.create).not.toHaveBeenCalled();
      expect(notificationEvents.onNewServiceQuote).not.toHaveBeenCalled();
    });
  });

  describe('withdrawQuote', () => {
    it('throws when quote missing', async () => {
      (serviceQuotesRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(serviceBroadcastsService.withdrawQuote('u1', 'q1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('throws when not the quote owner', async () => {
      (serviceQuotesRepository.findById as jest.Mock).mockResolvedValue({
        id: 'q1',
        status: 'PENDING',
        provider: { sellerProfile: { userId: 'other' } },
      });
      await expect(serviceBroadcastsService.withdrawQuote('u1', 'q1')).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('throws when quote is not PENDING', async () => {
      (serviceQuotesRepository.findById as jest.Mock).mockResolvedValue({
        id: 'q1',
        status: 'ACCEPTED',
        provider: { sellerProfile: { userId: 'u1' } },
      });
      await expect(serviceBroadcastsService.withdrawQuote('u1', 'q1')).rejects.toThrow(
        ConflictError,
      );
    });

    it('withdraws a pending own quote', async () => {
      (serviceQuotesRepository.findById as jest.Mock).mockResolvedValue({
        id: 'q1',
        status: 'PENDING',
        provider: { sellerProfile: { userId: 'u1' } },
      });
      (serviceQuotesRepository.withdraw as jest.Mock).mockResolvedValue({
        id: 'q1',
        status: 'WITHDRAWN',
      });
      const result = await serviceBroadcastsService.withdrawQuote('u1', 'q1');
      expect(result.status).toBe('WITHDRAWN');
    });
  });

  describe('acceptQuote', () => {
    const pendingQuote = {
      id: 'q1',
      broadcastId: 'b1',
      status: 'PENDING',
      provider: { sellerProfile: { userId: 'provider-user' } },
    };

    it('throws when not the customer', async () => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue(openBroadcast);
      await expect(serviceBroadcastsService.acceptQuote('other', 'b1', 'q1')).rejects.toThrow(
        ForbiddenError,
      );
    });

    it('throws when quote not on this broadcast', async () => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue(openBroadcast);
      (serviceQuotesRepository.findById as jest.Mock).mockResolvedValue({
        ...pendingQuote,
        broadcastId: 'other',
      });
      await expect(
        serviceBroadcastsService.acceptQuote('customer-1', 'b1', 'q1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('accepts quote, declines others, notifies, starts conversation', async () => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue(openBroadcast);
      (serviceQuotesRepository.findById as jest.Mock).mockResolvedValue(pendingQuote);
      (serviceBroadcastsRepository.markAccepted as jest.Mock).mockResolvedValue({ count: 1 });
      (serviceQuotesRepository.accept as jest.Mock).mockResolvedValue(undefined);
      (serviceQuotesRepository.declineOthers as jest.Mock).mockResolvedValue(undefined);
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        const tx = {
          serviceRequestBroadcast: {
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              id: 'b1',
              status: 'ACCEPTED',
              customerId: 'customer-1',
              title: 'Need plumber',
            }),
          },
        };
        return fn(tx);
      });

      const result = await serviceBroadcastsService.acceptQuote('customer-1', 'b1', 'q1');

      expect(result.status).toBe('ACCEPTED');
      expect(notificationEvents.onServiceQuoteAccepted).toHaveBeenCalled();
      expect(conversationsService.startFromUser).toHaveBeenCalledWith(
        'customer-1',
        'provider-user',
      );
    });

    it('throws ConflictError when markAccepted loses the race', async () => {
      (serviceBroadcastsRepository.findById as jest.Mock).mockResolvedValue(openBroadcast);
      (serviceQuotesRepository.findById as jest.Mock).mockResolvedValue(pendingQuote);
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
        (serviceBroadcastsRepository.markAccepted as jest.Mock).mockResolvedValue({ count: 0 });
        return fn({});
      });

      await expect(
        serviceBroadcastsService.acceptQuote('customer-1', 'b1', 'q1'),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('getMyQuotes', () => {
    it('requires a provider profile and returns paginated quotes', async () => {
      (sellersRepository.findByUserId as jest.Mock).mockResolvedValue({ id: 'seller-1' });
      (serviceProvidersRepository.findBySellerProfileId as jest.Mock).mockResolvedValue({
        id: 'provider-1',
      });
      (serviceQuotesRepository.findManyByProviderId as jest.Mock).mockResolvedValue({
        quotes: [{ id: 'q1' }],
        total: 1,
      });

      const result = await serviceBroadcastsService.getMyQuotes('provider-user', {});
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });
});
