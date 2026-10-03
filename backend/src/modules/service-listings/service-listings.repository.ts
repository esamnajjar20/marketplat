import { prisma } from '../../config/prisma';
import { Prisma, ServiceListing, ServiceListingStatus } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { analyzeSearchQuery } from '../../shared/utils/searchQueryIntelligence';
import { GetServiceListingsQuery } from './service-listings.validation';
import { MAX_IMAGES_PER_ENTITY } from '../../config/limits';

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

/** SLOW-NET phase5: public list omits long description. */
const serviceListingListSelect = {
  id: true,
  providerId: true,
  categoryId: true,
  title: true,
  images: true,
  pricingType: true,
  price: true,
  durationEstimate: true,
  serviceLocation: true,
  status: true,
  views: true,
  createdAt: true,
  updatedAt: true,
  provider: {
    select: {
      id: true,
      businessName: true,
      logoUrl: true,
      availabilityStatus: true,
      serviceAreaCities: true,
      contactPhone: true,
      sellerProfile: {
        select: {
          userId: true,
          displayName: true,
          verified: true,
          averageRating: true,
          suspended: true,
        },
      },
    },
  },
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
      offlineOperationId?: string | null;
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
        ...(data.offlineOperationId ? { offlineOperationId: data.offlineOperationId } : {}),
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
  addImages: async (id: string, newImages: string[], maxImages = MAX_IMAGES_PER_ENTITY): Promise<ServiceListing> => {
    // FIX RAW-SQL-MAXIMAGES-GUARD-01: maxImages is interpolated
    // directly into the SQL as `LIMIT ${safeMaxImages}` below — it cannot
    // be a bound parameter without restructuring the whole statement,
    // and a future caller passing an attacker-controlled number would
    // be a SQL injection vector. Every current call site uses the
    // module constant, but the guard here means this function can
    // never become an injection sink even if that changes. The 100 cap
    // is generous (MAX_IMAGES_PER_ENTITY is 10) and matches the same
    // "trust nothing that lands in the SQL string" discipline as
    // queryTimeout.ts's safeTimeoutMs.
    const safeMaxImages =
      Number.isInteger(maxImages) && maxImages > 0 && maxImages <= 100
        ? maxImages
        : MAX_IMAGES_PER_ENTITY;
    const placeholders = newImages.map((_, i) => `$${i + 2}`).join(', ');

    // RAWUNSAFE-SAFETY-NOTE-01: $executeRawUnsafe is correct here —
    // the only thing interpolated into the SQL string is the NUMBER of
    // placeholders ($2, $3, ...), which is bounded by safeMaxImages
    // (validated 1..100 above). Every user-supplied value (the ids in
    // newImages, plus the row id) is passed as a bound parameter. Do
    // NOT replace with a template literal by editing this into
    // $executeRaw — that form can't express a dynamic-length IN list.
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
           LIMIT ${safeMaxImages}
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

    let ftsIds: string[] | undefined;
    if (search?.trim()) {
      const { tsQueryString } = analyzeSearchQuery(search.trim());
      const effectiveTs = tsQueryString ?? search.trim();
      const idRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT sl."id"
        FROM "service_listings" sl
        INNER JOIN "service_provider_details" p ON sl."providerId" = p."id"
        INNER JOIN "seller_profiles" sp ON p."sellerProfileId" = sp."id"
        WHERE sl."status" = 'ACTIVE'
          AND sp."suspended" = false
          AND (
            setweight(to_tsvector('simple', arabic_normalize(coalesce(sl."title", ''))), 'A') ||
            setweight(to_tsvector('simple', arabic_normalize(coalesce(sl."description", ''))), 'B')
          ) @@ to_tsquery('simple', arabic_normalize(${effectiveTs}))
      `;
      ftsIds = idRows.map((r) => r.id);
      if (ftsIds.length === 0) {
        return { listings: [], total: 0 };
      }
    }

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
      ...(ftsIds ? { id: { in: ftsIds } } : {}),

    };

    const [listings, total] = await Promise.all([
      prisma.serviceListing.findMany({
        where,
        select: serviceListingListSelect,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      prisma.serviceListing.count({ where }),
    ]);

    // SLOW-NET phase5: serviceListingListSelect omits description, but
    // ServiceListingWithProvider is still the public type — cast is safe.
    return { listings: listings as unknown as ServiceListingWithProvider[], total };
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
