import { prisma } from '../../config/prisma';
import { Prisma, ServiceRequestBroadcast, ServiceQuote, ServiceBroadcastStatus, ServiceQuoteStatus } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export type BroadcastWithRelations = Prisma.ServiceRequestBroadcastGetPayload<{
  include: {
    customer: { select: { id: true; name: true; avatarUrl: true } };
    category: { select: { id: true; nameAr: true; slug: true } };
    quotes: {
      include: {
        provider: {
          include: {
            sellerProfile: { select: { userId: true; displayName: true; avatarUrl: true; verified: true } };
          };
        };
      };
    };
    acceptedQuote: true;
  };
}>;

export type BroadcastListItem = Prisma.ServiceRequestBroadcastGetPayload<{
  include: {
    customer: { select: { id: true; name: true; avatarUrl: true } };
    category: { select: { id: true; nameAr: true; slug: true } };
    _count: { select: { quotes: true } };
  };
}>;

export type QuoteWithProvider = Prisma.ServiceQuoteGetPayload<{
  include: {
    provider: {
      include: {
        sellerProfile: { select: { userId: true; displayName: true; avatarUrl: true; verified: true } };
      };
    };
  };
}>;

const broadcastWithRelations = {
  customer: { select: { id: true, name: true, avatarUrl: true } },
  category: { select: { id: true, nameAr: true, slug: true } },
  quotes: {
    include: {
      provider: {
        include: {
          sellerProfile: { select: { userId: true, displayName: true, avatarUrl: true, verified: true } },
        },
      },
    },
    orderBy: { price: 'asc' },
  },
  acceptedQuote: true,
} as const;

export const serviceBroadcastsRepository = {
  create: (
    customerId: string,
    data: { categoryId: string; title: string; description: string; city?: string; attachedImages?: string[] }
  ): Promise<ServiceRequestBroadcast> =>
    prisma.serviceRequestBroadcast.create({
      data: {
        customerId,
        categoryId: data.categoryId,
        title: data.title,
        description: data.description,
        city: data.city,
        attachedImages: data.attachedImages ?? [],
      },
    }),

  findById: (id: string): Promise<BroadcastWithRelations | null> =>
    prisma.serviceRequestBroadcast.findUnique({ where: { id }, include: broadcastWithRelations }),

  // ANNOUNCE FEED: only ever OPEN broadcasts — a browsing provider has
  // nothing to act on once a broadcast is ACCEPTED/CANCELLED. Excludes
  // the caller's own broadcasts implicitly not needed here since only
  // customers create broadcasts and only providers call this feed, but
  // no cross-check exists to enforce that distinction (a user can be
  // both) — see service-broadcasts.service.ts's submitQuote for the
  // one place self-quoting is actually blocked.
  findOpenFeed: async (
    query: { page?: number; limit?: number; categoryId?: string; city?: string }
  ): Promise<{ broadcasts: BroadcastListItem[]; total: number }> => {
    const { page = 1, limit = 20, categoryId, city } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ServiceRequestBroadcastWhereInput = {
      status: 'OPEN',
      ...(categoryId && { categoryId }),
      ...(city && { city }),
    };

    const [broadcasts, total] = await Promise.all([
      prisma.serviceRequestBroadcast.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, avatarUrl: true } },
          category: { select: { id: true, nameAr: true, slug: true } },
          _count: { select: { quotes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.serviceRequestBroadcast.count({ where }),
    ]);

    return { broadcasts, total };
  },

  findManyByCustomerId: async (
    customerId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ broadcasts: BroadcastListItem[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ServiceRequestBroadcastWhereInput = { customerId };

    const [broadcasts, total] = await Promise.all([
      prisma.serviceRequestBroadcast.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, avatarUrl: true } },
          category: { select: { id: true, nameAr: true, slug: true } },
          _count: { select: { quotes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.serviceRequestBroadcast.count({ where }),
    ]);

    return { broadcasts, total };
  },

  cancel: (id: string): Promise<ServiceRequestBroadcast> =>
    prisma.serviceRequestBroadcast.update({ where: { id }, data: { status: 'CANCELLED' } }),

  // Atomic conditional update, same "WHERE includes expected current
  // status" philosophy as service-requests.repository.ts's
  // transitionStatus — the accept transaction races against nothing
  // else in practice (only the owning customer can call it), but this
  // is defense in depth against a double-submit from the client.
  markAccepted: (
    tx: Prisma.TransactionClient,
    id: string,
    acceptedQuoteId: string
  ): Promise<Prisma.BatchPayload> =>
    tx.serviceRequestBroadcast.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'ACCEPTED', acceptedQuoteId },
    }),
};

export const serviceQuotesRepository = {
  create: (
    broadcastId: string,
    providerId: string,
    data: { price: number; message?: string; durationEstimate?: string }
  ): Promise<ServiceQuote> =>
    prisma.serviceQuote.create({
      data: {
        broadcastId,
        providerId,
        price: data.price,
        message: data.message,
        durationEstimate: data.durationEstimate,
      },
    }),

  findById: (id: string): Promise<QuoteWithProvider | null> =>
    prisma.serviceQuote.findUnique({
      where: { id },
      include: {
        provider: {
          include: {
            sellerProfile: { select: { userId: true, displayName: true, avatarUrl: true, verified: true } },
          },
        },
      },
    }),

  findByBroadcastAndProvider: (broadcastId: string, providerId: string): Promise<ServiceQuote | null> =>
    prisma.serviceQuote.findUnique({
      where: { broadcastId_providerId: { broadcastId, providerId } },
    }),

  // A provider revising an already-submitted offer — one row per
  // provider per broadcast (see the model's own @@unique), so this is
  // always an update, never a second insert.
  update: (
    id: string,
    data: { price: number; message?: string; durationEstimate?: string }
  ): Promise<ServiceQuote> =>
    prisma.serviceQuote.update({
      where: { id },
      data: { price: data.price, message: data.message, durationEstimate: data.durationEstimate },
    }),

  withdraw: (id: string): Promise<ServiceQuote> =>
    prisma.serviceQuote.update({ where: { id }, data: { status: 'WITHDRAWN' } }),

  accept: (tx: Prisma.TransactionClient, id: string): Promise<ServiceQuote> =>
    tx.serviceQuote.update({ where: { id }, data: { status: 'ACCEPTED' } }),

  // Every other PENDING quote on the same broadcast, auto-declined the
  // moment one is accepted — a provider who lost the bid shouldn't be
  // left showing "قيد الانتظار" forever with no way to know the
  // broadcast has already been decided.
  declineOthers: (
    tx: Prisma.TransactionClient,
    broadcastId: string,
    acceptedQuoteId: string
  ): Promise<Prisma.BatchPayload> =>
    tx.serviceQuote.updateMany({
      where: { broadcastId, id: { not: acceptedQuoteId }, status: 'PENDING' },
      data: { status: 'DECLINED' },
    }),

  findManyByProviderId: async (
    providerId: string,
    query: { page?: number; limit?: number }
  ): Promise<{ quotes: QuoteWithProvider[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ServiceQuoteWhereInput = { providerId };

    const [quotes, total] = await Promise.all([
      prisma.serviceQuote.findMany({
        where,
        include: {
          provider: {
            include: {
              sellerProfile: { select: { userId: true, displayName: true, avatarUrl: true, verified: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.serviceQuote.count({ where }),
    ]);

    return { quotes, total };
  },
};
