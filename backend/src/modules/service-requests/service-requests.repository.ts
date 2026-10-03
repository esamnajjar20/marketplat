import { prisma } from '../../config/prisma';
import { Prisma, ServiceRequest, ServiceRequestStatus } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export type ServiceRequestWithListing = Prisma.ServiceRequestGetPayload<{
  include: {
    listing: {
      include: {
        provider: { include: { sellerProfile: true } };
      };
    };
    customer: { select: { id: true; name: true; avatarUrl: true } };
    review: { select: { id: true } };
  };
}>;

const requestWithRelations = {
  listing: { include: { provider: { include: { sellerProfile: true } } } },
  customer: { select: { id: true, name: true, avatarUrl: true } },
  // Epic 3.2/3.3: lets the customer-side list/detail UI show "review
  // submitted" instead of a review button without a second round-trip —
  // { select: { id: true } } keeps this cheap since only presence matters.
  review: { select: { id: true } },
} as const;

export const serviceRequestsRepository = {
  create: (
    tx: Prisma.TransactionClient,
    customerId: string,
    listingId: string,
    data: { details: string; attachedImages: string[]; offlineOperationId?: string | null }
  ): Promise<ServiceRequest> =>
    tx.serviceRequest.create({
      data: {
        customerId,
        listingId,
        details: data.details,
        attachedImages: data.attachedImages,
        ...(data.offlineOperationId ? { offlineOperationId: data.offlineOperationId } : {}),
      },
    }),

  // FIX SR-DUPLICATE (audit H4): any not-yet-finished request by the same
  // customer for the same listing.
  findOpenByCustomerAndListing: (
    customerId: string,
    listingId: string
  ): Promise<Pick<ServiceRequest, 'id' | 'status'> | null> =>
    prisma.serviceRequest.findFirst({
      where: { customerId, listingId, status: { in: ['PENDING', 'ACCEPTED', 'IN_PROGRESS'] } },
      select: { id: true, status: true },
    }),

  // FIX SR-EXPIRY (audit H4): stale PENDING requests, oldest first, bounded.
  findStalePending: (
    cutoff: Date,
    limit: number
  ): Promise<{ id: string; customerId: string; listing: { title: string } }[]> =>
    prisma.serviceRequest.findMany({
      where: { status: 'PENDING', createdAt: { lt: cutoff } },
      select: { id: true, customerId: true, listing: { select: { title: true } } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),

  // Conditional on status + age so a request the provider answered a
  // moment ago is never overwritten. respondedAt is deliberately left NULL:
  // that is what marks "closed by the system, nobody responded".
  expirePending: (id: string, cutoff: Date): Promise<Prisma.BatchPayload> =>
    prisma.serviceRequest.updateMany({
      where: { id, status: 'PENDING', createdAt: { lt: cutoff } },
      // FIX SR-EXPIRY-STATUS (audit H4): EXPIRED, not CANCELLED — distinguishes
      // system-closed from user-closed.
      data: { status: 'EXPIRED' },
    }),

  findById: (id: string): Promise<ServiceRequestWithListing | null> =>
    prisma.serviceRequest.findUnique({ where: { id }, include: requestWithRelations }),

  // services-design.md §7: the WHERE clause includes the expected
  // current status, so the update silently no-ops (count=0) if the
  // status changed between the read above and this write — same
  // atomic-conditional-update philosophy as the concurrency fix in
  // ads.service.ts, without needing a Redis lock here since this
  // single UPDATE is atomic by construction.
  transitionStatus: (
    tx: Prisma.TransactionClient,
    id: string,
    from: ServiceRequestStatus,
    to: ServiceRequestStatus,
    extra?: { quotedPrice?: number; agreedPrice?: number }
  ): Promise<Prisma.BatchPayload> =>
    tx.serviceRequest.updateMany({
      where: { id, status: from },
      data: {
        status: to,
        respondedAt: new Date(),
        ...(extra?.quotedPrice !== undefined && { quotedPrice: extra.quotedPrice }),
        ...(extra?.agreedPrice !== undefined && { agreedPrice: extra.agreedPrice }),
      },
    }),

  findManyByCustomerId: async (
    customerId: string,
    query: { page?: number; limit?: number; status?: ServiceRequestStatus }
  ): Promise<{ requests: ServiceRequestWithListing[]; total: number }> => {
    const { page = 1, limit = 20, status } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ServiceRequestWhereInput = { customerId, ...(status && { status }) };

    const [requests, total] = await Promise.all([
      prisma.serviceRequest.findMany({
        where,
        include: requestWithRelations,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.serviceRequest.count({ where }),
    ]);
    return { requests, total };
  },

  // FIX (dead-stats): completedRequestsCount/fulfillmentRate
  // (ServiceProviderDetails) are rendered on MyServiceProviderCard but
  // were never written anywhere — see service-requests.service.ts's
  // recomputeProviderStats, the one place that now calls this. Counts
  // only the three terminal statuses (COMPLETED/CANCELLED/REJECTED);
  // PENDING/ACCEPTED/IN_PROGRESS are still in flight and shouldn't
  // count against or for the rate yet. Joined through `listing`
  // (ServiceRequest has no direct providerId column), same relation
  // findManyByProviderId below already uses.
  countTerminalStatsByProviderId: async (
    providerId: string,
    since?: Date
  ): Promise<{ completed: number; cancelledOrRejected: number }> => {
    const sinceFilter = since ? { updatedAt: { gte: since } } : {};
    const [completed, cancelledOrRejected] = await Promise.all([
      prisma.serviceRequest.count({
        where: { listing: { providerId }, status: 'COMPLETED', ...sinceFilter },
      }),
      // FIX SR-EXPIRY-FULFILL (audit H4): auto-closed requests are EXPIRED
      // (never reached the provider), so only a user-driven CANCELLED — which
      // always goes through transitionStatus and stamps respondedAt — counts
      // against the provider. EXPIRED is deliberately excluded.
      prisma.serviceRequest.count({
        where: {
          listing: { providerId },
          OR: [{ status: 'REJECTED' }, { status: 'CANCELLED', respondedAt: { not: null } }],
          ...sinceFilter,
        },
      }),
    ]);
    return { completed, cancelledOrRejected };
  },

  // ANALYTICS: requests awaiting the provider's first response — the
  // number a provider actually needs to act on today, distinct from
  // "all open requests" (which would also include ACCEPTED/IN_PROGRESS
  // work already underway).
  countPendingByProviderId: (providerId: string): Promise<number> =>
    prisma.serviceRequest.count({ where: { listing: { providerId }, status: 'PENDING' } }),

  // ANALYTICS: revenue is only ever a fact once a request is COMPLETED
  // and only ever what was actually agreed (agreedPrice), never the
  // provider's opening quotedPrice — same "don't show a number that
  // isn't real yet" reasoning as StoreAnalytics omitting revenue
  // entirely where no Order model exists. This one does exist here
  // (ServiceRequest.agreedPrice), so it's included.
  sumRevenueByProviderId: async (providerId: string, since?: Date): Promise<number> => {
    const result = await prisma.serviceRequest.aggregate({
      where: {
        listing: { providerId },
        status: 'COMPLETED',
        ...(since ? { updatedAt: { gte: since } } : {}),
      },
      _sum: { agreedPrice: true },
    });
    return result._sum.agreedPrice ? Number(result._sum.agreedPrice) : 0;
  },

  // Requests addressed to a given provider — joined through listing.
  findManyByProviderId: async (
    providerId: string,
    query: { page?: number; limit?: number; status?: ServiceRequestStatus }
  ): Promise<{ requests: ServiceRequestWithListing[]; total: number }> => {
    const { page = 1, limit = 20, status } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ServiceRequestWhereInput = {
      listing: { providerId },
      ...(status && { status }),
    };

    const [requests, total] = await Promise.all([
      prisma.serviceRequest.findMany({
        where,
        include: requestWithRelations,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.serviceRequest.count({ where }),
    ]);
    return { requests, total };
  },
};
