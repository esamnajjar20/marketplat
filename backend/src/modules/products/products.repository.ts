import { prisma } from '../../config/prisma';
import { Prisma, Product, ProductStatus, ProductAvailability } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { analyzeSearchQuery } from '../../shared/utils/searchQueryIntelligence';
import { GetProductsQuery } from './products.validation';
import { MAX_IMAGES_PER_ENTITY } from '../../config/limits';

export type ProductWithStore = Prisma.ProductGetPayload<{
  include: {
    store: { include: { sellerProfile: true, storeType: { include: { fields: { where: { isActive: true, scope: 'PRODUCT' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } } } } };
    category: { select: { id: true; name: true; nameAr: true } };
  };
}>;

// FEAT-FAVORITE-POLYMORPHIC PR2: exported so favorites.repository.ts
// can build a PRODUCT favorite's card using the exact same include
// shape as every other cross-module Product read, instead of a
// second, potentially-drifting definition.
// FIX PRODUCTWITHRELATIONS-CONST: `as const` on the whole object makes
// Prisma's orderBy tuple readonly (rejected by SortOrder typing). Narrow
// only the literals Prisma needs ('PRODUCT', 'asc'/'desc').
export const productWithRelations = {
  store: { include: { sellerProfile: true, storeType: { include: { fields: { where: { isActive: true, scope: 'PRODUCT' as const }, orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] } } } } },
  category: { select: { id: true, name: true, nameAr: true } },
};

/**
 * FIX PRODUCT-LITE-01: same shape as productWithRelations but WITHOUT
 * the storeType.fields array. Used by homepage recommendations and the
 * favourites list — neither surfaces product attributes, so shipping
 * the fields array per product was pure payload bloat on 3G (a product
 * with 3-4 active fields added ~2-4 KB; 12 items × 4 rails = tens of
 * KB per /home load).
 *
 * The product detail page (findPublicById) still uses the full variant
 * because ProductDetail's "بيانات إضافية" section reads those fields.
 */
export const productWithRelationsLite = {
  store: { include: { sellerProfile: true, storeType: true } },
  category: { select: { id: true, name: true, nameAr: true } },
};

export type ProductWithStoreLite = Prisma.ProductGetPayload<{
  include: {
    store: { include: { sellerProfile: true; storeType: true } };
    category: { select: { id: true; name: true; nameAr: true } };
  };
}>;

/** SLOW-NET phase5: list payload omits long description (detail still full). */
const productListSelect = {
  id: true,
  storeId: true,
  categoryId: true,
  name: true,
  images: true,
  price: true,
  discountPrice: true,
  wholesalePrice: true,
  wholesaleMinQty: true,
  availability: true,
  stockQuantity: true,
  status: true,
  views: true,
  createdAt: true,
  updatedAt: true,
  store: {
    select: {
      id: true,
      name: true,
      logoUrl: true,
      city: true,
      status: true,
      sellerProfile: {
        select: {
          id: true,
          verified: true,
          averageRating: true,
          suspended: true,
        },
      },
    },
  },
  category: { select: { id: true, name: true, nameAr: true } },
} as const;



export const productsRepository = {
  create: (
    tx: Prisma.TransactionClient,
    storeId: string,
    data: {
      categoryId: string;
      name: string;
      description: string;
      images: string[];
      price: number;
      discountPrice?: number;
      wholesalePrice?: number;
      wholesaleMinQty?: number;
      availability: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';
      stockQuantity?: number | null;
      offlineOperationId?: string | null;
      attributes?: Prisma.InputJsonValue;
    }
  ): Promise<Product> =>
    tx.product.create({
      data: {
        storeId,
        categoryId: data.categoryId,
        name: data.name,
        description: data.description,
        images: data.images,
        price: data.price,
        discountPrice: data.discountPrice,
        wholesalePrice: data.wholesalePrice,
        wholesaleMinQty: data.wholesaleMinQty,
        availability: data.availability,
        stockQuantity: data.stockQuantity ?? null,
        ...(data.offlineOperationId ? { offlineOperationId: data.offlineOperationId } : {}),
        ...(data.attributes !== undefined ? { attributes: data.attributes } : {}),
      },
    }),

  findById: (id: string): Promise<Product | null> =>
    prisma.product.findUnique({ where: { id } }),

  findPublicById: (id: string): Promise<ProductWithStore | null> =>
    prisma.product.findUnique({ where: { id }, include: productWithRelations }),

  incrementViews: (id: string): Promise<Product> =>
    prisma.product.update({ where: { id }, data: { views: { increment: 1 } } }),

  // STORE-ANALYTICS (Foundation v1): "top products" tile on the store
  // owner's analytics endpoint — cheap, since Product.views is already
  // a plain indexed-by-implication scalar column, no join needed.
  findTopByStoreId: (storeId: string, limit: number): Promise<Pick<Product, 'id' | 'name' | 'views' | 'images'>[]> =>
    prisma.product.findMany({
      where: { storeId, status: 'ACTIVE' },
      select: { id: true, name: true, views: true, images: true },
      orderBy: { views: 'desc' },
      take: limit,
    }),

  update: (
    id: string,
    data: Partial<{
      categoryId: string;
      name: string;
      description: string;
      images: string[];
      price: number;
      stockQuantity: number | null;
      discountPrice: number | null;
      wholesalePrice: number | null;
      wholesaleMinQty: number | null;
      availability: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';
      status: ProductStatus;
      attributes: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    }>
  ): Promise<Product> => prisma.product.update({ where: { id }, data }),

  updateWithStockMovement: async (
    id: string,
    storeId: string,
    changedByUserId: string,
    data: Partial<{
      categoryId: string;
      name: string;
      description: string;
      images: string[];
      price: number;
      stockQuantity: number | null;
      discountPrice: number | null;
      wholesalePrice: number | null;
      wholesaleMinQty: number | null;
      availability: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';
      status: ProductStatus;
      attributes: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    }>,
    reason = 'MANUAL_ADJUSTMENT',
  ): Promise<Product> => prisma.$transaction(async tx => {
    const current = await tx.product.findUnique({ where: { id } });
    if (!current || current.storeId !== storeId) throw new Error('PRODUCT_NOT_FOUND');

    const updated = await tx.product.update({ where: { id }, data });
    if (data.stockQuantity !== undefined && current.stockQuantity !== updated.stockQuantity) {
      const previousQuantity = current.stockQuantity;
      const newQuantity = updated.stockQuantity;
      await tx.stockMovement.create({
        data: {
          productId: id,
          storeId,
          changedByUserId,
          previousQuantity,
          newQuantity,
          delta:
            previousQuantity != null && newQuantity != null
              ? newQuantity - previousQuantity
              : null,
          reason,
        },
      });
    }
    return updated;
  }),

  getStockSummary: async (storeId: string) => {
    const [totalProducts, trackedProducts, inStock, limited, outOfStock, totalUnits] =
      await Promise.all([
        prisma.product.count({ where: { storeId, status: 'ACTIVE' } }),
        prisma.product.count({ where: { storeId, status: 'ACTIVE', stockQuantity: { not: null } } }),
        prisma.product.count({ where: { storeId, status: 'ACTIVE', availability: 'IN_STOCK' } }),
        prisma.product.count({ where: { storeId, status: 'ACTIVE', availability: 'LIMITED' } }),
        prisma.product.count({ where: { storeId, status: 'ACTIVE', availability: 'OUT_OF_STOCK' } }),
        prisma.product.aggregate({
          where: { storeId, status: 'ACTIVE', stockQuantity: { not: null } },
          _sum: { stockQuantity: true },
        }),
      ]);
    return {
      totalProducts,
      trackedProducts,
      untrackedProducts: totalProducts - trackedProducts,
      inStock,
      limited,
      outOfStock,
      totalUnits: totalUnits._sum.stockQuantity ?? 0,
    };
  },

  getStockHistory: async (
    storeId: string,
    page: number,
    limit: number,
    productId?: string,
  ) => {
    const where = { storeId, ...(productId ? { productId } : {}) };
    const [total, items] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          productId: true,
          changedByUserId: true,
          previousQuantity: true,
          newQuantity: true,
          delta: true,
          reason: true,
          createdAt: true,
          product: { select: { name: true } },
        },
      }),
    ]);
    return { total, items };
  },

  // Soft delete, same convention as ads/service-listings — keeps
  // historical references (e.g. conversations about this product)
  // intact rather than a hard row removal.
  softDelete: (id: string): Promise<Product> =>
    prisma.product.update({ where: { id }, data: { status: 'DELETED' } }),

  // Mirrors ads.repository.ts's addImages exactly: atomic array append
  // via raw SQL (no SELECT + UPDATE race), with existing images always
  // ordered first (source/position tagging) so overflow trims new
  // uploads rather than silently dropping existing ones.
  addImages: async (id: string, newImages: string[], maxImages = MAX_IMAGES_PER_ENTITY): Promise<Product> => {
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

    await prisma.$executeRawUnsafe(
      `UPDATE "products"
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

    return prisma.product.findUniqueOrThrow({ where: { id } });
  },

  // Mirrors ads.repository.ts's removeImage — atomic, no read-before-write race.
  removeImage: async (id: string, imageUrl: string): Promise<Product> => {
    await prisma.$executeRaw`
      UPDATE "products"
      SET "images" = array_remove("images", ${imageUrl})
      WHERE "id" = ${id}
    `;
    return prisma.product.findUniqueOrThrow({ where: { id } });
  },

  // Gap #11: mirrors ads.repository.ts's reorderImages — full-array
  // replace, permutation check happens in entityImageOperations.ts
  // before this is called.
  reorderImages: async (id: string, orderedImages: string[]): Promise<Product> =>
    prisma.product.update({ where: { id }, data: { images: orderedImages } }),

  findMany: async (
    query: GetProductsQuery
  ): Promise<{ products: ProductWithStore[]; total: number }> => {
    const {
      page = 1,
      limit = 20,
      categoryId,
      storeId,
      city,
      availability,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      hasPromotion,
    } = query;
    const { skip, take } = getPaginationParams(page, limit);

    // AUDIT-FIX (#2): use GIN + arabic_normalize (same expression as
    // products_search_idx) instead of ILIKE contains.
    let ftsIds: string[] | undefined;
    if (search?.trim()) {
      const { tsQueryString } = analyzeSearchQuery(search.trim());
      const effectiveTs = tsQueryString ?? search.trim();
      const idRows = await prisma.$queryRaw<{ id: string }[]>`
        SELECT p."id"
        FROM "products" p
        INNER JOIN "store_details" s ON p."storeId" = s."id"
        INNER JOIN "seller_profiles" sp ON s."sellerProfileId" = sp."id"
        WHERE p."status" = 'ACTIVE'
          AND s."status" = 'ACTIVE'
          AND sp."suspended" = false
          AND (
            setweight(to_tsvector('simple', arabic_normalize(coalesce(p."name", ''))), 'A') ||
            setweight(to_tsvector('simple', arabic_normalize(coalesce(p."description", ''))), 'B')
          ) @@ to_tsquery('simple', arabic_normalize(${effectiveTs}))
      `;
      ftsIds = idRows.map((r) => r.id);
      if (ftsIds.length === 0) {
        return { products: [], total: 0 };
      }
    }

    // SEC-FIX: an admin suspending a seller (SellerProfile.suspended)
    // blocks that seller from *creating* new products/ads/listings
    // (see sellers.service.ts, ads.service.ts, service-listings.service.ts)
    // but nothing previously stopped their existing, already-published
    // products from continuing to show up here and remain purchasable —
    // suspension only ever bit new writes, never public reads. Folding
    // `store.sellerProfile.suspended: false` into the same relation
    // filter as the existing `store.status: 'ACTIVE'` check closes that
    // gap for both the plain and the city-filtered branch below (city
    // re-specifies `store` as a nested object, which replaces rather
    // than merges the earlier `store` key in a JS object spread, so the
    // suspended check has to be repeated there too, not just once).
    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      store: { status: 'ACTIVE', sellerProfile: { suspended: false } },
      ...(categoryId && { categoryId }),
      ...(storeId && { storeId }),
      ...(availability && { availability }),
      // Products don't carry their own city — they inherit the store's,
      // same relation-filter approach service-listings.repository.ts
      // uses for provider.serviceAreaCities.
      ...(city && { store: { status: 'ACTIVE', sellerProfile: { suspended: false }, city } }),
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        price: {
          ...(minPrice !== undefined && { gte: minPrice }),
          ...(maxPrice !== undefined && { lte: maxPrice }),
        },
      }),
      ...(ftsIds ? { id: { in: ftsIds } } : {}),

      // PROMO-1 (Phase 10): relation filter on the Promotion model
      // added for the store-owner CRUD module — deliberately status-
      // based (SCHEDULED or ACTIVE row exists), not a startsAt/endsAt
      // window check, matching the same "status column, kept fresh by
      // promotionsService.syncStatus on read/write, not swept on a
      // cron" lazy-status design documented on that model. A promotion
      // whose endsAt just passed can appear here for a short window
      // until it's next read and re-synced — acceptable for a
      // discovery section, not acceptable for anything charging money.
      ...(hasPromotion && { promotions: { some: { status: { in: ['SCHEDULED', 'ACTIVE'] } } } }),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        select: productListSelect,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      prisma.product.count({ where }),
    ]);

    // SLOW-NET phase5: productListSelect omits description, but ProductWithStore
    // is still the public type — cast is safe (the wire shape is lighter).
    return { products: products as unknown as ProductWithStore[], total };
  },

  findManyByStoreId: async (
    storeId: string,
    query: {
      page?: number;
      limit?: number;
      status?: ProductStatus;
      availability?: ProductAvailability;
      search?: string;
    }
  ): Promise<{ products: Product[]; total: number }> => {
    const { page = 1, limit = 20, status, availability, search } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ProductWhereInput = {
      storeId,
      status: status ? status : { not: 'DELETED' },
      ...(availability ? { availability } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.product.count({ where }),
    ]);

    return { products, total };
  },
};
