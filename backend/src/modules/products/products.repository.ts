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

    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      store: { status: 'ACTIVE' },
      ...(categoryId && { categoryId }),
      ...(storeId && { storeId }),
      ...(availability && { availability }),
      // Products don't carry their own city — they inherit the store's,
      // same relation-filter approach service-listings.repository.ts
      // uses for provider.serviceAreaCities.
      ...(city && { store: { status: 'ACTIVE', city } }),
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
