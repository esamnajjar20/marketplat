import { prisma } from '../../config/prisma';
import { Prisma, ServiceListing, ServiceListingStatus } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { GetServiceListingsQuery } from './service-listings.validation';

export type ServiceListingWithProvider = Prisma.ServiceListingGetPayload<{
  include: {
    provider: { include: { sellerProfile: true } };
    category: { select: { id: true; name: true; nameAr: true } };
  };
}>;

const listingWithRelations = {
  provider: { include: { sellerProfile: true } },
  category: { select: { id: true, name: true, nameAr: true } },
} as const;

export const serviceListingsRepository = {
  create: (
    tx: Prisma.TransactionClient,
    providerId: string,
    data: {
      categoryId: string;
      title: string;
      description: string;
      images: string[];
      pricingType: 'FIXED' | 'STARTING_FROM' | 'NEGOTIABLE';
      price?: number;
      durationEstimate?: string;
      serviceLocation: 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE';
    }
  ): Promise<ServiceListing> =>
    tx.serviceListing.create({
      data: {
        providerId,
        categoryId: data.categoryId,
        title: data.title,
        description: data.description,
        images: data.images,
        pricingType: data.pricingType,
        price: data.price,
        durationEstimate: data.durationEstimate,
        serviceLocation: data.serviceLocation,
      },
    }),

  findById: (id: string): Promise<ServiceListing | null> =>
    prisma.serviceListing.findUnique({ where: { id } }),

  findPublicById: (id: string): Promise<ServiceListingWithProvider | null> =>
    prisma.serviceListing.findUnique({ where: { id }, include: listingWithRelations }),

  incrementViews: (id: string): Promise<ServiceListing> =>
    prisma.serviceListing.update({ where: { id }, data: { views: { increment: 1 } } }),

  update: (
    id: string,
    data: Partial<{
      categoryId: string;
      title: string;
      description: string;
      images: string[];
      pricingType: 'FIXED' | 'STARTING_FROM' | 'NEGOTIABLE';
      price: number | null;
      durationEstimate: string | null;
      serviceLocation: 'AT_CUSTOMER' | 'AT_PROVIDER' | 'REMOTE';
      status: ServiceListingStatus;
    }>
  ): Promise<ServiceListing> => prisma.serviceListing.update({ where: { id }, data }),

  // Soft delete, same convention as ads (status DELETED rather than a
  // row removal) — keeps historical service_requests referencing this
  // listing intact.
  softDelete: (id: string): Promise<ServiceListing> =>
    prisma.serviceListing.update({ where: { id }, data: { status: 'DELETED' } }),

  findMany: async (
    query: GetServiceListingsQuery
  ): Promise<{ listings: ServiceListingWithProvider[]; total: number }> => {
    const {
      page = 1,
      limit = 20,
      categoryId,
      providerId,
      city,
      serviceLocation,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.ServiceListingWhereInput = {
      status: 'ACTIVE',
      ...(categoryId && { categoryId }),
      ...(providerId && { providerId }),
      ...(serviceLocation && { serviceLocation }),
      // Providers list the cities they serve (serviceAreaCities), not
      // listings themselves — same exact-match-over-index rationale as
      // ads.repository.ts's city filter, via a relation filter instead
      // of a direct column.
      ...(city && { provider: { serviceAreaCities: { has: city } } }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        price: {
          ...(minPrice !== undefined && { gte: minPrice }),
          ...(maxPrice !== undefined && { lte: maxPrice }),
        },
      }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [listings, total] = await Promise.all([
      prisma.serviceListing.findMany({
        where,
        include: listingWithRelations,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      prisma.serviceListing.count({ where }),
    ]);

    return { listings, total };
  },

  findManyByProviderId: async (
    providerId: string,
    query: { page?: number; limit?: number; status?: ServiceListingStatus }
  ): Promise<{ listings: ServiceListing[]; total: number }> => {
    const { page = 1, limit = 20, status } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ServiceListingWhereInput = {
      providerId,
      status: status ? status : { not: 'DELETED' },
    };

    const [listings, total] = await Promise.all([
      prisma.serviceListing.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.serviceListing.count({ where }),
    ]);

    return { listings, total };
  },
};
