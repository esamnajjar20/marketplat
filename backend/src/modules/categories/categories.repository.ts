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
};
