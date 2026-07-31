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
    data: { details: string; attachedImages: string[] }
  ): Promise<ServiceRequest> =>
    tx.serviceRequest.create({
      data: {
        customerId,
        listingId,
        details: data.details,
        attachedImages: data.attachedImages,
      },
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
