import { prisma } from '../../config/prisma';
import { ProductCategory } from '@prisma/client';
import { CreateProductCategoryInput, UpdateProductCategoryInput } from './product-categories.validation';

export type ProductCategoryWithChildren = ProductCategory & { children?: ProductCategory[] };

export const productCategoriesRepository = {
  create: async (data: CreateProductCategoryInput): Promise<ProductCategory> =>
    prisma.productCategory.create({ data }),

  // Public browse tree: only active top-level categories + their active
  // children — same shape as serviceCategoriesRepository.findMany.
  findMany: async (): Promise<ProductCategoryWithChildren[]> =>
    prisma.productCategory.findMany({
      where: { parentId: null, isActive: true },
      include: { children: { where: { isActive: true } } },
      orderBy: { name: 'asc' },
    }),

  findManyForAdmin: async (): Promise<
    Array<
      ProductCategory & {
        children: Array<ProductCategory & { _count: { products: number } }>;
        _count: { products: number };
      }
    >
  > =>
    prisma.productCategory.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { name: 'asc' },
          include: { _count: { select: { products: true } } },
        },
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    }),

  findById: async (id: string): Promise<ProductCategory | null> =>
    prisma.productCategory.findUnique({ where: { id }, include: { children: true } }),

  findBySlug: async (slug: string): Promise<ProductCategory | null> =>
    prisma.productCategory.findUnique({ where: { slug } }),

  findByName: async (name: string): Promise<ProductCategory | null> =>
    prisma.productCategory.findUnique({ where: { name } }),

  findByNameAr: async (nameAr: string): Promise<ProductCategory | null> =>
    prisma.productCategory.findUnique({ where: { nameAr } }),

  update: async (id: string, data: UpdateProductCategoryInput): Promise<ProductCategory> =>
    prisma.productCategory.update({ where: { id }, data }),

  delete: async (id: string): Promise<void> => {
    await prisma.productCategory.delete({ where: { id } });
  },

  // Delete-guard: only ACTIVE products block a category delete, same
  // rule as serviceCategoriesRepository.countListings.
  countProducts: async (id: string): Promise<number> =>
    prisma.product.count({ where: { categoryId: id, status: 'ACTIVE' } }),
};
