import { prisma } from '../../config/prisma';
import { Category } from '@prisma/client';
import { CreateCategoryInput, UpdateCategoryInput } from './categories.validation';

export type CategoryWithChildren = Category & { children?: Category[] };

export const categoriesRepository = {
  create: async (data: CreateCategoryInput): Promise<Category> => prisma.category.create({ data }),

  findMany: async (): Promise<CategoryWithChildren[]> =>
    prisma.category.findMany({
      where: { parentId: null },
      include: { children: true },
      orderBy: { name: 'asc' },
    }),

  findById: async (id: string): Promise<Category | null> =>
    prisma.category.findUnique({ where: { id }, include: { children: true } }),

  // BUGFIX (circular category reference) — same fix as
  // productCategoriesRepository.findParentChain, applied here for
  // consistency: walks up from a proposed parentId toward the root,
  // collecting every ancestor's id. updateCategory uses this to reject
  // a parentId that is the category's own id or one of its own
  // descendants. Capped at 100 hops as a defensive backstop.
  findParentChain: async (startId: string): Promise<string[]> => {
    const chain: string[] = [];
    let currentId: string | null = startId;
    let hops = 0;
    while (currentId && hops < 100) {
      const node: { id: string; parentId: string | null } | null = await prisma.category.findUnique({
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

  findBySlug: async (slug: string): Promise<Category | null> =>
    prisma.category.findUnique({ where: { slug } }),

  findByName: async (name: string): Promise<Category | null> =>
    prisma.category.findUnique({ where: { name } }),

  findByNameAr: async (nameAr: string): Promise<Category | null> =>
    prisma.category.findUnique({ where: { nameAr } }),

  update: async (id: string, data: UpdateCategoryInput): Promise<Category> =>
    prisma.category.update({ where: { id }, data }),

  delete: async (id: string): Promise<void> => {
    await prisma.category.delete({ where: { id } });
  },

  countAds: async (id: string): Promise<number> =>
    prisma.ad.count({ where: { categoryId: id, status: 'ACTIVE' } }),

  // BUGFIX (FK violation on delete) — same fix as
  // productCategoriesRepository.countChildren: a category with
  // subcategories hits Prisma's P2003 if deleted directly, and only
  // countAds guarded the delete path before this.
  countChildren: async (id: string): Promise<number> =>
    prisma.category.count({ where: { parentId: id } }),
};
