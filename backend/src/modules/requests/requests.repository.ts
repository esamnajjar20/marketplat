import { prisma } from '../../config/prisma';
import { Prisma, Request as RequestRow, RequestOffer, RequestStatus, RequestOfferStatus } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

const offererSelect = {
  id: true,
  name: true,
  avatarUrl: true,
} as const;

const requestDetailInclude = {
  customer: { select: { id: true, name: true, avatarUrl: true } },
  offers: {
    include: { offerer: { select: offererSelect } },
    orderBy: { price: 'asc' as const },
  },
  acceptedOffer: {
    include: { offerer: { select: offererSelect } },
  },
} as const;

const requestListInclude = {
  customer: { select: { id: true, name: true, avatarUrl: true } },
  _count: { select: { offers: true } },
} as const;

export type RequestWithRelations = Prisma.RequestGetPayload<{
  include: typeof requestDetailInclude;
}>;

export type RequestListItem = Prisma.RequestGetPayload<{
  include: typeof requestListInclude;
}>;

export type OfferWithOfferer = Prisma.RequestOfferGetPayload<{
  include: {
    offerer: { select: typeof offererSelect };
    request: {
      select: { id: true; title: true; type: true; status: true; city: true };
    };
  };
}>;

export const requestsRepository = {
  create: (
    customerId: string,
    data: {
      type: 'SERVICE' | 'PRODUCT' | 'RENTAL';
      categoryId: string;
      title: string;
      description: string;
      city?: string;
      attachedImages?: string[];
      budgetMin?: number;
      budgetMax?: number;
      attributes?: Prisma.InputJsonValue;
      expiresAt?: Date | null;
      offlineOperationId?: string | null;
    },
  ): Promise<RequestRow> =>
    prisma.request.create({
      data: {
        customerId,
        type: data.type,
        categoryId: data.categoryId,
        title: data.title,
        description: data.description,
        city: data.city,
        attachedImages: data.attachedImages ?? [],
        budgetMin: data.budgetMin,
        budgetMax: data.budgetMax,
        attributes: data.attributes ?? Prisma.JsonNull,
        expiresAt: data.expiresAt ?? null,
        ...(data.offlineOperationId ? { offlineOperationId: data.offlineOperationId } : {}),
      },
    }),

  countOpenByCustomer: (customerId: string): Promise<number> =>
    prisma.request.count({ where: { customerId, status: 'OPEN' } }),

  findById: (id: string): Promise<RequestWithRelations | null> =>
    prisma.request.findUnique({ where: { id }, include: requestDetailInclude }),

  findOpenFeed: async (query: {
    page?: number;
    limit?: number;
    type?: 'SERVICE' | 'PRODUCT' | 'RENTAL';
    categoryId?: string;
    city?: string;
    q?: string;
    sort?: 'newest' | 'expiring' | 'budget_high' | 'fewest_offers';
  }): Promise<{ requests: RequestListItem[]; total: number }> => {
    const { page = 1, limit = 20, type, categoryId, city, q, sort = 'newest' } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const now = new Date();
    const search = q?.trim();
    const where: Prisma.RequestWhereInput = {
      status: 'OPEN',
      AND: [
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        ...(search
          ? [
              {
                OR: [
                  { title: { contains: search, mode: 'insensitive' as const } },
                  { description: { contains: search, mode: 'insensitive' as const } },
                ],
              },
            ]
          : []),
      ],
      ...(type && { type }),
      ...(categoryId && { categoryId }),
      ...(city && { city: { contains: city, mode: 'insensitive' as const } }),
    };

    // Server-side sort for the whole result set (not just the current page).
    const orderBy: Prisma.RequestOrderByWithRelationInput[] =
      sort === 'expiring'
        ? [{ expiresAt: 'asc' }, { createdAt: 'desc' }]
        : sort === 'budget_high'
          ? [{ budgetMax: 'desc' }, { budgetMin: 'desc' }, { createdAt: 'desc' }]
          : sort === 'fewest_offers'
            ? [{ offers: { _count: 'asc' } }, { createdAt: 'desc' }]
            : [{ createdAt: 'desc' }];

    const [requests, total] = await Promise.all([
      prisma.request.findMany({
        where,
        include: requestListInclude,
        orderBy,
        skip,
        take,
      }),
      prisma.request.count({ where }),
    ]);

    return { requests, total };
  },

  findManyByCustomerId: async (
    customerId: string,
    query: { page?: number; limit?: number; status?: RequestStatus },
  ): Promise<{ requests: RequestListItem[]; total: number }> => {
    const { page = 1, limit = 20, status } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.RequestWhereInput = {
      customerId,
      ...(status && { status }),
    };

    const [requests, total] = await Promise.all([
      prisma.request.findMany({
        where,
        include: requestListInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.request.count({ where }),
    ]);

    return { requests, total };
  },

  /**
   * T353 — conditional cancel. Ownership + OPEN status enforced in the
   * WHERE clause so a race between a read-check and this write cannot
   * cancel a request that was just accepted by another flow.
   * count === 0 → caller throws REQUEST_NOT_OPEN.
   */
  cancelIfOpen: (id: string, customerId: string): Promise<Prisma.BatchPayload> =>
    prisma.request.updateMany({
      where: { id, customerId, status: 'OPEN' },
      data: { status: 'CANCELLED' },
    }),

  /** Bare row fetch — used after conditional mutations to return canonical state. */
  findRowById: (id: string): Promise<RequestRow | null> =>
    prisma.request.findUnique({ where: { id } }),

  /**
   * Conditional accept — only succeeds when status is still OPEN.
   * count === 0 means another accept won the race.
   */
  markAccepted: (
    tx: Prisma.TransactionClient,
    requestId: string,
    offerId: string,
  ): Promise<Prisma.BatchPayload> =>
    tx.request.updateMany({
      where: { id: requestId, status: 'OPEN' },
      data: { status: 'ACCEPTED', acceptedOfferId: offerId },
    }),

  /** OPEN rows whose expiresAt is in the past → EXPIRED. */
  expireDue: (now: Date): Promise<Prisma.BatchPayload> =>
    prisma.request.updateMany({
      where: {
        status: 'OPEN',
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRED' },
    }),
};

export const requestOffersRepository = {
  create: (
    requestId: string,
    offererUserId: string,
    data: { price: number; message?: string; meta?: Prisma.InputJsonValue },
  ): Promise<RequestOffer> =>
    prisma.requestOffer.create({
      data: {
        requestId,
        offererUserId,
        price: data.price,
        message: data.message,
        meta: data.meta ?? Prisma.JsonNull,
      },
    }),

  update: (
    id: string,
    data: { price: number; message?: string; meta?: Prisma.InputJsonValue },
  ): Promise<RequestOffer> =>
    prisma.requestOffer.update({
      where: { id },
      data: {
        price: data.price,
        message: data.message,
        ...(data.meta !== undefined ? { meta: data.meta } : {}),
      },
    }),

  findById: (id: string): Promise<OfferWithOfferer | null> =>
    prisma.requestOffer.findUnique({
      where: { id },
      include: {
        offerer: { select: offererSelect },
        request: {
          select: { id: true, title: true, type: true, status: true, city: true },
        },
      },
    }),

  findByRequestAndOfferer: (
    requestId: string,
    offererUserId: string,
  ): Promise<RequestOffer | null> =>
    prisma.requestOffer.findUnique({
      where: { requestId_offererUserId: { requestId, offererUserId } },
    }),

  /**
   * T358 — conditional accept. PENDING enforced in WHERE so a concurrent
   * withdraw between the read and this write cannot be overwritten.
   * count === 0 → caller throws OFFER_NOT_PENDING.
   */
  accept: (tx: Prisma.TransactionClient, id: string): Promise<Prisma.BatchPayload> =>
    tx.requestOffer.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'ACCEPTED' },
    }),

  declineOthers: (
    tx: Prisma.TransactionClient,
    requestId: string,
    acceptedOfferId: string,
  ): Promise<Prisma.BatchPayload> =>
    tx.requestOffer.updateMany({
      where: { requestId, id: { not: acceptedOfferId }, status: 'PENDING' },
      data: { status: 'DECLINED' },
    }),

  /**
   * T357 — conditional withdraw. offererUserId + PENDING enforced in
   * WHERE. count === 0 → caller throws OFFER_NOT_PENDING.
   */
  withdrawIfPending: (id: string, offererUserId: string): Promise<Prisma.BatchPayload> =>
    prisma.requestOffer.updateMany({
      where: { id, offererUserId, status: 'PENDING' },
      data: { status: 'WITHDRAWN' },
    }),

  /** Bare offer fetch — used for T357/T358 service flows. */
  findOfferById: (id: string): Promise<RequestOffer | null> =>
    prisma.requestOffer.findUnique({ where: { id } }),

  findManyByOfferer: async (
    offererUserId: string,
    query: { page?: number; limit?: number; status?: RequestOfferStatus },
  ): Promise<{ offers: OfferWithOfferer[]; total: number }> => {
    const { page = 1, limit = 20, status } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.RequestOfferWhereInput = {
      offererUserId,
      ...(status && { status }),
    };

    const [offers, total] = await Promise.all([
      prisma.requestOffer.findMany({
        where,
        include: {
          offerer: { select: offererSelect },
          request: {
            select: {
              id: true,
              title: true,
              type: true,
              status: true,
              city: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.requestOffer.count({ where }),
    ]);

    return { offers, total };
  },
};
