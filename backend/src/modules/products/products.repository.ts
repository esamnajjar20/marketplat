import { prisma } from '../../config/prisma';
import { Prisma, Product, ProductStatus } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { GetProductsQuery } from './products.validation';

export type ProductWithStore = Prisma.ProductGetPayload<{
  include: {
    store: { include: { sellerProfile: true } };
    category: { select: { id: true; name: true; nameAr: true } };
  };
}>;

const productWithRelations = {
  store: { include: { sellerProfile: true } },
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
      },
    }),

  findById: (id: string): Promise<Product | null> =>
    prisma.product.findUnique({ where: { id } }),

  findPublicById: (id: string): Promise<ProductWithStore | null> =>
    prisma.product.findUnique({ where: { id }, include: productWithRelations }),

  incrementViews: (id: string): Promise<Product> =>
    prisma.product.update({ where: { id }, data: { views: { increment: 1 } } }),

  update: (
    id: string,
    data: Partial<{
      categoryId: string;
      name: string;
      description: string;
      images: string[];
      price: number;
      discountPrice: number | null;
      wholesalePrice: number | null;
      wholesaleMinQty: number | null;
      availability: 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';
      status: ProductStatus;
    }>
  ): Promise<Product> => prisma.product.update({ where: { id }, data }),

  // Soft delete, same convention as ads/service-listings — keeps
  // historical references (e.g. conversations about this product)
  // intact rather than a hard row removal.
  softDelete: (id: string): Promise<Product> =>
    prisma.product.update({ where: { id }, data: { status: 'DELETED' } }),

  // Mirrors ads.repository.ts's addImages exactly: atomic array append
  // via raw SQL (no SELECT + UPDATE race), with existing images always
  // ordered first (source/position tagging) so overflow trims new
  // uploads rather than silently dropping existing ones.
  addImages: async (id: string, newImages: string[], maxImages = 10): Promise<Product> => {
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
           LIMIT ${maxImages}
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
    } = query;
    const { skip, take } = getPaginationParams(page, limit);

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
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productWithRelations,
        orderBy: { [sortBy]: sortOrder },
        skip,
        take,
      }),
      prisma.product.count({ where }),
    ]);

    return { products, total };
  },

  findManyByStoreId: async (
    storeId: string,
    query: { page?: number; limit?: number; status?: ProductStatus }
  ): Promise<{ products: Product[]; total: number }> => {
    const { page = 1, limit = 20, status } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.ProductWhereInput = {
      storeId,
      status: status ? status : { not: 'DELETED' },
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.product.count({ where }),
    ]);

    return { products, total };
  },
};
