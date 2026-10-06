import { prisma } from '../../config/prisma';
import { Prisma, StoreDetails, StoreStatus } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { analyzeSearchQuery } from '../../shared/utils/searchQueryIntelligence';
import { GetStoresQuery } from './stores.validation';

export type StoreWithSeller = Prisma.StoreDetailsGetPayload<{
  include: { sellerProfile: true; storeType: true };
}>;

export type StoreWithSellerAndCounts = Prisma.StoreDetailsGetPayload<{
  include: {
    sellerProfile: true;
    // only ACTIVE products — pending/deleted
    // inventory must not inflate the public "منتج" stat on the
    // storefront or directory cards.
    _count: {
      select: {
        followers: true;
        products: { where: { status: 'ACTIVE' } };
      };
    };
  };
}>;

// FEAT-FAVORITE-POLYMORPHIC PR2: exported so favorites.repository.ts
// reuses the same StoreWithSeller include shape rather than a second
// definition.
// `as const` turned the orderBy tuple readonly,
// which Prisma rejects (StoreTypeFieldOrderByWithRelationInput[] is mutable).
// A plain object literal infers the same shape without readonly.
export const storeWithSeller = {
  sellerProfile: true,
  storeType: {
    include: {
      fields: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
    },
  },
};

/** SLOW-NET public directory — lighter seller fields. */
const storeListInclude = {
  sellerProfile: {
    select: {
      id: true,
      verified: true,
      averageRating: true,
      totalRatings: true,
      suspended: true,
    },
  },
} as const;


// per-property `as const` keeps
// 'asc'/'ACTIVE' narrowed to literal types; without it TS widens to
// `string` and Prisma's SortOrder/enum rejects the object.
const storeWithSellerAndCounts = {
  sellerProfile: true,
  storeType: {
    include: {
      fields: {
        where: { isActive: true as const },
        orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
      },
    },
  },
  // mirror the type above — public surfaces only
  // count ACTIVE products so the header/stat card matches the
  // products the visitor can actually browse.
  _count: {
    select: {
      followers: true,
      // `as const` here is valid (value position, not type) and keeps
      // 'ACTIVE' from widening to `string` (Prisma enum rejects string).
      products: { where: { status: 'ACTIVE' as const } },
    },
  },
};

export const storesRepository = {
  findBySellerProfileId: (sellerProfileId: string): Promise<StoreDetails | null> =>
    prisma.storeDetails.findUnique({
      where: { sellerProfileId },
      include: {
        storeType: {
          include: {
            fields: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
          },
        },
      },
    }),

  findById: (id: string): Promise<StoreDetails | null> =>
    prisma.storeDetails.findUnique({
      where: { id },
      include: {
        storeType: {
          include: {
            fields: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
          },
        },
      },
    }),

  // STORE-SLUG: used by storesService.createStore's collision-retry
  // loop (find-then-suffix, not a DB-level generated column) and by
  // getPublicStore's id-then-slug fallback lookup.
  findBySlug: (slug: string): Promise<StoreDetails | null> =>
    prisma.storeDetails.findUnique({ where: { slug } }),

  // FEAT-REPORT-USER-STORE: same query as findPublicById minus the
  // follower/product counts — reportsService only needs
  // sellerProfile.userId, not the full public-profile payload.
  findByIdWithSeller: (id: string): Promise<StoreWithSeller | null> =>
    prisma.storeDetails.findUnique({ where: { id }, include: storeWithSeller }),

  findPublicById: (id: string): Promise<StoreWithSellerAndCounts | null> =>
    prisma.storeDetails.findUnique({
      where: { id },
      include: storeWithSellerAndCounts,
    }),

  // STORE-SLUG: same shape as findPublicById — getPublicStore tries the
  // id lookup first (cheap, indexed PK) and only falls back to this
  // when nothing matched, since most direct traffic will still hit by
  // id until slug links propagate.
  findPublicBySlug: (slug: string): Promise<StoreWithSellerAndCounts | null> =>
    prisma.storeDetails.findUnique({
      where: { slug },
      include: storeWithSellerAndCounts,
    }),

  create: (
    tx: Prisma.TransactionClient,
    sellerProfileId: string,
    data: {
      name: string;
      slug: string;
      description: string;
      city: string;
      address?: string;
      phone: string;
      logoUrl?: string;
      coverImageUrl?: string;
      latitude?: number;
      longitude?: number;
      workingHours?: Prisma.InputJsonValue;
      storeTypeId?: string;
      attributes?: Prisma.InputJsonValue;
    }
  ): Promise<StoreDetails> =>
    tx.storeDetails.create({
      data: {
        sellerProfileId,
        name: data.name,
        slug: data.slug,
        description: data.description,
        city: data.city,
        address: data.address,
        phone: data.phone,
        logoUrl: data.logoUrl,
        coverImageUrl: data.coverImageUrl,
        latitude: data.latitude,
        longitude: data.longitude,
        workingHours: data.workingHours,
        ...(data.storeTypeId ? { storeTypeId: data.storeTypeId } : {}),
        ...(data.attributes ? { attributes: data.attributes } : {}),
      },
      include: { storeType: true },
    }),

  // UNIFY-PAYMENTS-STORES: paymentMethods removed from this signature —
  // StoreDetails no longer has that column at all (see schema.prisma).
  // The earlier (routing null through Prisma.JsonNull) is now
  // moot: there's nothing to null out on this model anymore. A store's
  // payment methods are its parent seller's, updated only through
  // sellersRepository.updateMyProfile.
  update: (
    id: string,
    data: Partial<{
      name: string;
      description: string;
      city: string;
      address: string | null;
      phone: string;
      logoUrl: string | null;
      coverImageUrl: string | null;
      latitude: number | null;
      longitude: number | null;
      workingHours: Prisma.InputJsonValue;
      storeTypeId?: string;
      attributes?: Prisma.InputJsonValue;
    }>
  ): Promise<StoreDetails> => prisma.storeDetails.update({ where: { id }, data, include: { storeType: true } }),

  // STORE-VIEWS: fire-and-forget from the service layer, same
  // "increment column, don't fail the read on error" convention as
  // productsRepository.incrementViews.
  incrementViews: (id: string): Promise<StoreDetails> =>
    prisma.storeDetails.update({ where: { id }, data: { views: { increment: 1 } } }),

  updateStatus: (id: string, status: 'PENDING' | 'ACTIVE' | 'BLOCKED'): Promise<StoreDetails> =>
    prisma.storeDetails.update({ where: { id }, data: { status } }),

  updateStoreType: (id: string, storeTypeId: string): Promise<StoreDetails> =>
    prisma.storeDetails.update({ where: { id }, data: { storeTypeId }, include: { storeType: true } }),

  // the DB write half of the FEATURED-plan admin endpoint.
  setFeatureRequestedAt: (id: string, at: Date | null) =>
    prisma.storeDetails.update({ where: { id }, data: { featureRequestedAt: at } }),

  updatePlan: (id: string, plan: 'FREE' | 'FEATURED'): Promise<StoreDetails> =>
    prisma.storeDetails.update({ where: { id }, data: { plan } }),

  // Public store directory — only ACTIVE stores. Featured-plan stores
  // sort first (stores proposal's "ظهور أعلى" perk), then the
  // requested sort within each tier.
  findMany: async (
    query: GetStoresQuery
  ): Promise<{ stores: StoreWithSeller[]; total: number }> => {
    const {
      page = 1,
      limit = 20,
      city,
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
        SELECT s."id"
        FROM "store_details" s
        INNER JOIN "seller_profiles" sp ON s."sellerProfileId" = sp."id"
        WHERE s."status" = 'ACTIVE'
          AND sp."suspended" = false
          AND (
            setweight(to_tsvector('simple', arabic_normalize(coalesce(s."name", ''))), 'A') ||
            setweight(to_tsvector('simple', arabic_normalize(coalesce(s."description", ''))), 'B')
          ) @@ to_tsquery('simple', arabic_normalize(${effectiveTs}))
      `;
      ftsIds = idRows.map((r) => r.id);
      if (ftsIds.length === 0) {
        return { stores: [], total: 0 };
      }
    }

    const where: Prisma.StoreDetailsWhereInput = {
      status: 'ACTIVE',
      // AUDIT-FIX (ads-feature review, extended to stores' own public
      // listing): same gap already in ads.repository.ts and
      // search.repository.ts — this endpoint had no suspended-seller
      // filter at all, so a suspended seller's store kept showing up
      // in the public "browse stores" directory.
      sellerProfile: { suspended: false },
      ...(city && { city }),
      ...(query.type ? { storeType: { slug: query.type } } : {}),
      ...(ftsIds ? { id: { in: ftsIds } } : {}),
    };

    const [stores, total] = await Promise.all([
      prisma.storeDetails.findMany({
        where,
        include: storeWithSeller,
        orderBy: [{ plan: 'desc' }, { [sortBy]: sortOrder }],
        skip,
        take,
      }),
      prisma.storeDetails.count({ where }),
    ]);

    return { stores, total };
  },

  findFeatured: async (
    params: {
      limit: number;
      city?: string;
    }
  ): Promise<{ stores: StoreWithSeller[]; total: number }> => {
    const { limit, city } = params;

    const where: Prisma.StoreDetailsWhereInput = {
      status: 'ACTIVE',
      plan: 'FEATURED',
      sellerProfile: { suspended: false },
      ...(city && { city }),
    };

    const [stores, total] = await Promise.all([
      prisma.storeDetails.findMany({
        where,
        include: storeWithSeller,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.storeDetails.count({ where }),
    ]);

    return { stores, total };
  },

  countActiveProducts: (storeId: string): Promise<number> =>
    prisma.product.count({ where: { storeId, status: 'ACTIVE' } }),

  // Admin directory — unlike findMany (public, hardcoded to ACTIVE),
  // this surfaces every status so PENDING stores (the ones actually
  // needing action) and BLOCKED ones are visible too. Mirrors
  // sellersRepository.findMany/count's admin-facing shape.
  findManyForAdmin: async (params: {
    skip: number;
    take: number;
    status?: StoreStatus;
    q?: string;
    /** AUDIT-FIX (#6): only stores that requested FEATURED plan */
    featureRequested?: boolean;
  }): Promise<{ stores: StoreWithSeller[]; total: number }> => {
    const { skip, take, status, q, featureRequested } = params;
    const where: Prisma.StoreDetailsWhereInput = {
      ...(status && { status }),
      ...(featureRequested ? { featureRequestedAt: { not: null } } : {}),
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };

    const [stores, total] = await Promise.all([
      prisma.storeDetails.findMany({
        where,
        include: storeWithSeller,
        orderBy: featureRequested
          ? [{ featureRequestedAt: 'desc' }, { createdAt: 'desc' }]
          : { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.storeDetails.count({ where }),
    ]);

    return { stores, total };
  },
};
