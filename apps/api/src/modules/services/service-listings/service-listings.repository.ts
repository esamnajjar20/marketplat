import { prisma } from '../../../config/prisma';
import { Prisma, ServiceListing, ServiceListingStatus } from '@prisma/client';
import { getPaginationParams } from '../../../shared/http/pagination';
import { analyzeSearchQuery } from '../../../shared/search/searchQueryIntelligence';
import { GetServiceListingsQuery } from './service-listings.validation';
import { MAX_IMAGES_PER_ENTITY } from '../../../config/limits';
import { BadRequestError } from '../../../shared/errors/BadRequestError';

// FEAT-FAVORITE-POLYMORPHIC PR2: exported so favorites.repository.ts
// reuses the same ServiceListingWithProvider include shape rather
// than a second definition. The detail endpoint includes the same
// public LISTING fields that the browse projection already exposes.
export const listingWithRelations = {
  provider: { include: { sellerProfile: true } },
  category: { select: { id: true, name: true, nameAr: true } },
  serviceType: {
    select: {
      id: true,
      slug: true,
      nameAr: true,
      fields: {
        where: { isActive: true, scope: 'LISTING' },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      },
    },
  },
} satisfies Prisma.ServiceListingInclude;

export type ServiceListingWithProvider = Prisma.ServiceListingGetPayload<{
  include: typeof listingWithRelations;
}>;

/** SLOW-NET public list omits long description. */
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
  serviceType: {
    select: {
      id: true,
      slug: true,
      nameAr: true,
      icon: true,
      capabilities: true,
      presentation: true,
      fields: {
        where: { isActive: true, scope: 'LISTING' },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      },
    },
  },
  attributes: true,
  provider: {
    select: {
      id: true,
      businessName: true,
      logoUrl: true,
      availabilityStatus: true,
      serviceAreaCities: true,
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
} satisfies Prisma.ServiceListingSelect;

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
      serviceTypeId: string;
      attributes?: Record<string, unknown>;
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
        serviceTypeId: data.serviceTypeId,
        attributes: data.attributes as unknown as Prisma.InputJsonValue | undefined,
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
      serviceTypeId?: string;
      attributes?: Record<string, unknown>;
      status: ServiceListingStatus;
    }>
  ): Promise<ServiceListing> =>
    prisma.serviceListing.update({
      where: { id },
      data: data as unknown as Prisma.ServiceListingUncheckedUpdateInput,
    }),

  // Soft delete, same convention as ads (status DELETED rather than a
  // row removal) — keeps historical service_requests referencing this
  // listing intact.
  softDelete: (id: string): Promise<ServiceListing> =>
    prisma.serviceListing.update({ where: { id }, data: { status: 'DELETED' } }),

  // Gap #3 fix: mirrors ads.repository.ts's addImages exactly — atomic
  // array append via raw SQL (no SELECT + UPDATE race), existing images
  // always ordered first so overflow trims new uploads, never existing ones.
  addImages: async (
    id: string,
    newImages: string[],
    maxImages = MAX_IMAGES_PER_ENTITY
  ): Promise<ServiceListing> => {
    // Enforce the dynamic SQL bounds at the repository boundary. The number
    // of bound image placeholders is capped by MAX_IMAGES_PER_ENTITY; the
    // SQL LIMIT is separately capped by the validated safeMaxImages value.
    if (newImages.length > MAX_IMAGES_PER_ENTITY) {
      throw new BadRequestError(
        `A maximum of ${MAX_IMAGES_PER_ENTITY} images may be added at once.`,
        'TOO_MANY_IMAGES'
      );
    }
    if (newImages.length === 0) {
      return prisma.serviceListing.findUniqueOrThrow({ where: { id } });
    }
    const safeMaxImages =
      Number.isInteger(maxImages) && maxImages > 0 && maxImages <= MAX_IMAGES_PER_ENTITY
        ? maxImages
        : MAX_IMAGES_PER_ENTITY;
    const placeholders = newImages.map((_, i) => `$${i + 2}`).join(', ');

    // RAWUNSAFE-SAFETY-NOTE-01: $executeRawUnsafe is correct here —
    // the only thing interpolated into the SQL string is the NUMBER of
    // placeholders ($2, $3, ...), which is bounded by MAX_IMAGES_PER_ENTITY.
    // The independent LIMIT is bounded by safeMaxImages. Every user-supplied value (the ids in
    // newImages, plus the row id) is passed as a bound parameter. Do
    // NOT replace with a literal by editing this into
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
      serviceTypeId,
      providerId,
      city,
      serviceLocation,
      minPrice,
      maxPrice,
      attributeFilters,
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
      ftsIds = idRows.map(r => r.id);
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
    const attributeFilterEntries = attributeFilters ? Object.entries(attributeFilters) : [];
    if (attributeFilterEntries.length > 12) {
      throw new Error('Too many service attribute filters.');
    }
    for (const [key, value] of attributeFilterEntries) {
      if (!/^[a-zA-Z0-9_:-]{1,64}$/.test(key)) {
        throw new Error('Invalid service attribute filter key.');
      }
      if (value === undefined || value === null || typeof value === 'function') {
        throw new Error('Invalid service attribute filter value.');
      }
    }

    const where: Prisma.ServiceListingWhereInput = {
      status: 'ACTIVE',
      provider: { sellerProfile: { suspended: false } },
      ...(categoryId && { categoryId }),
      ...(serviceTypeId && { serviceTypeId }),
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
      ...(attributeFilterEntries.length > 0
        ? {
            AND: attributeFilterEntries.map(([key, value]) => ({
              attributes: {
                path: [key],
                equals: value as Prisma.InputJsonValue,
              },
            })),
          }
        : {}),
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

    // SLOW-NET serviceListingListSelect omits description, but
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
    // Keep both metrics in one round-trip. The active count is filtered,
    // while total views intentionally include every status.
    const rows = await prisma.$queryRaw<
      Array<{ activeCount: bigint; totalViews: number | bigint | null }>
    >`
      SELECT
        COUNT(*) FILTER (WHERE "status" = 'ACTIVE') AS "activeCount",
        COALESCE(SUM("views"), 0) AS "totalViews"
      FROM "service_listings"
      WHERE "providerId" = ${providerId}
    `;
    const row = rows[0];
    return {
      activeCount: Number(row?.activeCount ?? 0n),
      totalViews: Number(row?.totalViews ?? 0),
    };
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
      prisma.serviceListing.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      prisma.serviceListing.count({ where }),
    ]);

    return { listings, total };
  },
};
