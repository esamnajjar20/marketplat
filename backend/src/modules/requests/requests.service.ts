import { prisma } from '../../config/prisma';
import { Prisma, Request as RequestRow, RequestOffer, RequestType } from '@prisma/client';
import {
  requestsRepository,
  requestOffersRepository,
  RequestWithRelations,
  RequestListItem,
  OfferWithOfferer,
} from './requests.repository';
import {
  CreateRequestInput,
  GetOpenRequestsQuery,
  GetMyRequestsQuery,
  SubmitOfferInput,
} from './requests.validation';
import { serviceCategoriesRepository } from '../service-categories/service-categories.repository';
import { productCategoriesRepository } from '../product-categories/product-categories.repository';
import { categoriesRepository } from '../categories/categories.repository';
import { serviceProvidersRepository } from '../service-providers/service-providers.repository';
import { sellersRepository } from '../sellers/sellers.repository';
import { conversationsService } from '../conversations/conversations.service';
import { notificationEvents } from '../notifications';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { ConflictError } from '../../shared/errors/ConflictError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { logger } from '../../shared/utils/logger';

/** Max simultaneous OPEN requests per customer (spam guard). */
const MAX_OPEN_REQUESTS = 5;

/** Default lifetime when client omits expiresInDays. */
const DEFAULT_EXPIRES_IN_DAYS = 14;

function resolveExpiresAt(expiresInDays?: number): Date {
  const days = expiresInDays ?? DEFAULT_EXPIRES_IN_DAYS;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * categoryId is not a Prisma FK (different trees per type). Validate here.
 * SERVICE → service_categories (active)
 * PRODUCT → product_categories (active)
 * RENTAL → ad categories (categories)
 */
async function assertCategoryForType(type: RequestType, categoryId: string): Promise<void> {
  if (type === 'SERVICE') {
    const cat = await serviceCategoriesRepository.findById(categoryId);
    if (!cat || cat.isActive === false) {
      throw new BadRequestError('Invalid or inactive service category.', 'INVALID_CATEGORY');
    }
    return;
  }
  if (type === 'PRODUCT') {
    const cat = await productCategoriesRepository.findById(categoryId);
    if (!cat || cat.isActive === false) {
      throw new BadRequestError('Invalid or inactive product category.', 'INVALID_CATEGORY');
    }
    return;
  }
  // RENTAL — classifieds category tree
  const cat = await categoriesRepository.findById(categoryId);
  if (!cat) {
    throw new BadRequestError('Invalid rental/ad category.', 'INVALID_CATEGORY');
  }
}

/**
 * Who may submit an offer (no offererRole column — enforced here).
 * SERVICE → must have ServiceProviderDetails
 * PRODUCT / RENTAL → must have a SellerProfile (any verified or not in Phase 1)
 */
async function assertCanSubmitOffer(type: RequestType, userId: string): Promise<void> {
  const seller = await sellersRepository.findByUserId(userId);
  if (!seller) {
    throw new ForbiddenError(
      type === 'SERVICE'
        ? 'Only service providers can offer on service requests.'
        : 'Create a seller profile before offering on product or rental requests.',
      type === 'SERVICE' ? 'NOT_A_SERVICE_PROVIDER' : 'NOT_A_SELLER',
    );
  }
  if (type === 'SERVICE') {
    const provider = await serviceProvidersRepository.findBySellerProfileId(seller.id);
    if (!provider) {
      throw new ForbiddenError(
        'Only service providers can offer on service requests.',
        'NOT_A_SERVICE_PROVIDER',
      );
    }
  }
}

export const requestsService = {
  create: async (customerId: string, input: CreateRequestInput): Promise<RequestRow> => {
    await assertCategoryForType(input.type, input.categoryId);

    const openCount = await requestsRepository.countOpenByCustomer(customerId);
    if (openCount >= MAX_OPEN_REQUESTS) {
      throw new ConflictError(
        `You already have ${MAX_OPEN_REQUESTS} open requests. Close or wait for one to expire.`,
        'MAX_OPEN_REQUESTS',
      );
    }

    return requestsRepository.create(customerId, {
      type: input.type,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      city: input.city,
      attachedImages: input.attachedImages,
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      attributes: input.attributes as Prisma.InputJsonValue | undefined,
      expiresAt: resolveExpiresAt(input.expiresInDays),
    });
  },

  getOpenFeed: async (
    query: GetOpenRequestsQuery,
  ): Promise<PaginatedResult<RequestListItem>> => {
    const { requests, total } = await requestsRepository.findOpenFeed(query);
    return {
      items: requests,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  getMyRequests: async (
    userId: string,
    query: GetMyRequestsQuery,
  ): Promise<PaginatedResult<RequestListItem>> => {
    const { requests, total } = await requestsRepository.findManyByCustomerId(userId, query);
    return {
      items: requests,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  /**
   * Competitive pricing: only the request owner sees all offers.
   * An offerer sees only their own offer; other authenticated users see
   * offer count via _count but no prices/names/messages.
   */
  getById: async (id: string, viewerUserId: string): Promise<RequestWithRelations> => {
    const row = await requestsRepository.findById(id);
    if (!row) throw new NotFoundError('Request not found', 'REQUEST_NOT_FOUND');

    if (row.customerId === viewerUserId) {
      return row;
    }

    const mine = (row.offers ?? []).filter((o) => o.offererUserId === viewerUserId);
    return {
      ...row,
      offers: mine,
    };
  },

  cancel: async (userId: string, id: string): Promise<RequestRow> => {
    const row = await requestsRepository.findById(id);
    if (!row) throw new NotFoundError('Request not found', 'REQUEST_NOT_FOUND');
    if (row.customerId !== userId) {
      throw new ForbiddenError('Only the customer who posted this can cancel it.', 'NOT_YOUR_REQUEST');
    }
    if (row.status !== 'OPEN') {
      throw new ConflictError('Only an open request can be cancelled.', 'REQUEST_NOT_OPEN');
    }
    return requestsRepository.cancel(id);
  },

  submitOffer: async (
    userId: string,
    requestId: string,
    input: SubmitOfferInput,
  ): Promise<RequestOffer> => {
    const request = await requestsRepository.findById(requestId);
    if (!request) throw new NotFoundError('Request not found', 'REQUEST_NOT_FOUND');
    if (request.status !== 'OPEN') {
      throw new ConflictError('This request is no longer accepting offers.', 'REQUEST_NOT_OPEN');
    }
    if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
      throw new ConflictError('This request has expired.', 'REQUEST_EXPIRED');
    }
    if (request.customerId === userId) {
      throw new BadRequestError('You cannot offer on your own request.', 'CANNOT_OFFER_OWN_REQUEST');
    }

    await assertCanSubmitOffer(request.type, userId);

    const existing = await requestOffersRepository.findByRequestAndOfferer(requestId, userId);
    const payload = {
      price: input.price,
      message: input.message,
      meta: input.meta as Prisma.InputJsonValue | undefined,
    };

    if (existing) {
      if (existing.status === 'WITHDRAWN') {
        return prisma.requestOffer.update({
          where: { id: existing.id },
          data: {
            price: payload.price,
            message: payload.message,
            meta: payload.meta ?? Prisma.JsonNull,
            status: 'PENDING',
          },
        });
      }
      if (existing.status !== 'PENDING') {
        throw new ConflictError('This offer can no longer be revised.', 'OFFER_NOT_PENDING');
      }
      return requestOffersRepository.update(existing.id, payload);
    }

    const created = await requestOffersRepository.create(requestId, userId, payload);

    // Fire-and-forget notification to the request owner
    const offererName =
      (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name ??
      'مستخدم';
    notificationEvents
      .onNewRequestOffer(request.customerId, requestId, created.id, offererName, request.title)
      .catch((err) =>
        logger.error('Failed to create NEW_REQUEST_OFFER notification', { err, requestId }),
      );

    return created;
  },

  withdrawOffer: async (userId: string, requestId: string, offerId: string): Promise<RequestOffer> => {
    const offer = await requestOffersRepository.findById(offerId);
    if (!offer || offer.requestId !== requestId) {
      throw new NotFoundError('Offer not found on this request.', 'OFFER_NOT_FOUND');
    }
    if (offer.offererUserId !== userId) {
      throw new ForbiddenError('You can only withdraw your own offer.', 'NOT_YOUR_OFFER');
    }
    if (offer.status !== 'PENDING') {
      throw new ConflictError('Only a pending offer can be withdrawn.', 'OFFER_NOT_PENDING');
    }
    return requestOffersRepository.withdraw(offerId);
  },

  acceptOffer: async (userId: string, requestId: string, offerId: string): Promise<RequestRow> => {
    const request = await requestsRepository.findById(requestId);
    if (!request) throw new NotFoundError('Request not found', 'REQUEST_NOT_FOUND');
    if (request.customerId !== userId) {
      throw new ForbiddenError('Only the customer can accept an offer.', 'NOT_YOUR_REQUEST');
    }
    if (request.status !== 'OPEN') {
      throw new ConflictError('This request has already been decided.', 'REQUEST_NOT_OPEN');
    }

    const offer = await requestOffersRepository.findById(offerId);
    if (!offer || offer.requestId !== requestId) {
      throw new NotFoundError('Offer not found on this request.', 'OFFER_NOT_FOUND');
    }
    if (offer.status !== 'PENDING') {
      throw new ConflictError('This offer is no longer available.', 'OFFER_NOT_PENDING');
    }

    const result = await prisma.$transaction(async (tx) => {
      const acceptResult = await requestsRepository.markAccepted(tx, requestId, offerId);
      if (acceptResult.count === 0) {
        throw new ConflictError('This request has already been decided.', 'REQUEST_NOT_OPEN');
      }
      await requestOffersRepository.accept(tx, offerId);
      await requestOffersRepository.declineOthers(tx, requestId, offerId);
      return tx.request.findUniqueOrThrow({ where: { id: requestId } });
    });

    notificationEvents
      .onRequestOfferAccepted(offer.offererUserId, requestId, offerId, request.title)
      .catch((err) =>
        logger.error('Failed to create REQUEST_OFFER_ACCEPTED notification', { err, requestId }),
      );

    conversationsService
      .startFromUser(userId, offer.offererUserId)
      .catch((err) =>
        logger.error('Failed to start conversation after request offer acceptance', {
          err,
          requestId,
        }),
      );

    return result;
  },

  getMyOffers: async (
    userId: string,
    query: { page?: number; limit?: number },
  ): Promise<PaginatedResult<OfferWithOfferer>> => {
    const { offers, total } = await requestOffersRepository.findManyByOfferer(userId, query);
    return {
      items: offers,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  /**
   * Marks OPEN rows past expiresAt as EXPIRED. Intended for cron / job runner.
   * Returns number of rows updated.
   */
  expireDueRequests: async (): Promise<number> => {
    const result = await requestsRepository.expireDue(new Date());
    if (result.count > 0) {
      logger.info('Expired open requests', { count: result.count });
    }
    return result.count;
  },
};
