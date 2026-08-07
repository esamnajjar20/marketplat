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

  // BUGFIX (circular category reference): walks up from a proposed
  // parentId toward the root, collecting every ancestor's id along the
  // way. updateProductCategory uses this to reject a parentId that is
  // either the category's own id or one of its own descendants —
  // either would create a cycle in the parent chain, and the tree
  // shape here is only ever two levels deep by convention (findMany's
  // include only ever fetches one level of `children`), but nothing in
  // the schema enforces that depth limit, so a self-referential loop
  // introduced via update would hang any code that walks parentId
  // upward (or recurses into children) without a visited-set guard.
  // Capped at 100 hops as a defensive backstop — a legitimate tree
  // should never be anywhere near that deep, so hitting the cap itself
  // signals a cycle already exists from some earlier bad write, same
  // as if the walk had failed to terminate.
  findParentChain: async (startId: string): Promise<string[]> => {
    const chain: string[] = [];
    let currentId: string | null = startId;
    let hops = 0;
    while (currentId && hops < 100) {
      const node: { id: string; parentId: string | null } | null =
        await prisma.productCategory.findUnique({
          where: { id: currentId },
          select: { id: true, parentId: true },
        });
      if (!node) break;
      chain.push(node.id);
      currentId = node.parentId;
      hops += 1;
    }
    return chain;
  },

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

  // BUGFIX (FK violation on delete): a category with subcategories
  // (children.parentId -> this category's id) hits Prisma's P2003
  // foreign-key constraint if deleted directly — previously only
  // countProducts guarded the delete path, so a childless-of-products
  // but parent-of-categories row still fell through to an unhandled
  // 500. Mirrors countProducts's shape so deleteProductCategory can
  // guard on both counts before ever calling delete().
  countChildren: async (id: string): Promise<number> =>
    prisma.productCategory.count({ where: { parentId: id } }),
};
