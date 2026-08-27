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

// FEAT-FAVORITE-POLYMORPHIC PR2: exported so favorites.repository.ts
// reuses the same ServiceListingWithProvider include shape rather
// than a second definition.
export const listingWithRelations = {
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

  // Gap #3 fix: mirrors ads.repository.ts's addImages exactly — atomic
  // array append via raw SQL (no SELECT + UPDATE race), existing images
  // always ordered first so overflow trims new uploads, never existing ones.
  addImages: async (id: string, newImages: string[], maxImages = 10): Promise<ServiceListing> => {
    const placeholders = newImages.map((_, i) => `$${i + 2}`).join(', ');

    await prisma.$executeRawUnsafe(
      `UPDATE "service_listings"
       SET "images" = (
         SELECT array_agg(img ORDER BY rn)
         FROM (
           SELECT img, ROW_NUMBER() OVER (ORDER BY src, ord) AS rn
           FROM (
             SELECT img, ord, 0 AS src
             FROM unnest("images") WITH ORDINALITY AS t(img, ord)
             UNION ALL
             SELECT img, ord, 1 AS src
             FROM unnest(ARRAY[${placeholders}]::text[]) WITH ORDINALITY AS t(img, ord)
           ) combined
           ORDER BY src, ord
           LIMIT ${maxImages}
         ) limited
       )
       WHERE "id" = $1`,
      id,
      ...newImages
    );

    return prisma.serviceListing.findUniqueOrThrow({ where: { id } });
  },

  // Gap #3 fix: mirrors ads.repository.ts's removeImage — atomic, no
  // read-before-write race.
  removeImage: async (id: string, imageUrl: string): Promise<ServiceListing> => {
    await prisma.$executeRaw`
      UPDATE "service_listings"
      SET "images" = array_remove("images", ${imageUrl})
      WHERE "id" = ${id}
    `;
    return prisma.serviceListing.findUniqueOrThrow({ where: { id } });
  },

  // Gap #11: mirrors ads.repository.ts's reorderImages — full-array
  // replace, permutation check happens in entityImageOperations.ts
  // before this is called.
  reorderImages: async (id: string, orderedImages: string[]): Promise<ServiceListing> =>
    prisma.serviceListing.update({ where: { id }, data: { images: orderedImages } }),

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

    // SEC-FIX: same gap as products.repository.ts / ads.repository.ts —
    // a suspended seller's ServiceProviderDetails.sellerProfile.suspended
    // only ever blocked new listing creation (see
    // service-listings.service.ts's ForbiddenError check), never
    // removed already-published listings from public search. provider
    // here plays the same role products.repository.ts's `store` does —
    // a one-hop relation to SellerProfile — so this is folded into the
    // same `provider` relation filter as the city branch below, same
    // "nested object replaces rather than merges" caveat.
    const where: Prisma.ServiceListingWhereInput = {
      status: 'ACTIVE',
      provider: { sellerProfile: { suspended: false } },
      ...(categoryId && { categoryId }),
      ...(providerId && { providerId }),
      ...(serviceLocation && { serviceLocation }),
      // Providers list the cities they serve (serviceAreaCities), not
      // listings themselves — same exact-match-over-index rationale as
      // ads.repository.ts's city filter, via a relation filter instead
      // of a direct column.
      ...(city && {
        provider: { serviceAreaCities: { has: city }, sellerProfile: { suspended: false } },
      }),
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

  // ANALYTICS: mirrors productsRepository.findTopByStoreId — active
  // listings only (a paused/deleted listing accrued its views while it
  // was live, but isn't something the provider can currently act on
  // promoting), ordered by views desc, capped at `limit`.
  findTopByProviderId: (providerId: string, limit: number): Promise<ServiceListing[]> =>
    prisma.serviceListing.findMany({
      where: { providerId, status: 'ACTIVE' },
      orderBy: { views: 'desc' },
      take: limit,
    }),

  // ANALYTICS: one grouped query for "active listing count" + "total
  // views across all listings" — the two provider-level rollups
  // getMyServiceProviderAnalytics needs beyond the top-5 list above.
  // Views intentionally sum across ALL statuses (not just ACTIVE) —
  // views already happened and are a historical fact about the
  // provider's total reach, same as StoreDetails.views not resetting
  // when a product is paused.
  getStatsByProviderId: async (
    providerId: string
  ): Promise<{ activeCount: number; totalViews: number }> => {
    const [activeCount, viewsResult] = await Promise.all([
      prisma.serviceListing.count({ where: { providerId, status: 'ACTIVE' } }),
      prisma.serviceListing.aggregate({ where: { providerId }, _sum: { views: true } }),
    ]);
    return { activeCount, totalViews: viewsResult._sum.views ?? 0 };
  },

  findManyByProviderId: async (
    providerId: string,
    query: {
      page?: number;
      limit?: number;
      status?: ServiceListingStatus;
      search?: string;
    }
  ): Promise<{ listings: ServiceListing[]; total: number }> => {
    const { page = 1, limit = 20, status, search } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ServiceListingWhereInput = {
      providerId,
      status: status ? status : { not: 'DELETED' },
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [listings, total] = await Promise.all([
      prisma.serviceListing.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.serviceListing.count({ where }),
    ]);

    return { listings, total };
  },
};
