import { prisma } from '../../config/prisma';
import { ServiceCategory } from '@prisma/client';
import { CreateServiceCategoryInput, UpdateServiceCategoryInput } from './service-categories.validation';

export type ServiceCategoryWithChildren = ServiceCategory & { children?: ServiceCategory[] };

export const serviceCategoriesRepository = {
  create: async (data: CreateServiceCategoryInput): Promise<ServiceCategory> =>
    prisma.serviceCategory.create({ data }),

  // Only active top-level categories (+ their children) for the public
  // browse tree — same shape as categoriesRepository.findMany, but also
  // filters isActive since service_categories supports soft-deactivation
  // (services-design.md §3), which "categories" does not have.
  findMany: async (): Promise<ServiceCategoryWithChildren[]> =>
    prisma.serviceCategory.findMany({
      where: { parentId: null, isActive: true },
      include: { children: { where: { isActive: true } } },
      orderBy: { name: 'asc' },
    }),

  findById: async (id: string): Promise<ServiceCategory | null> =>
    prisma.serviceCategory.findUnique({ where: { id }, include: { children: true } }),

  findBySlug: async (slug: string): Promise<ServiceCategory | null> =>
    prisma.serviceCategory.findUnique({ where: { slug } }),

  findByName: async (name: string): Promise<ServiceCategory | null> =>
    prisma.serviceCategory.findUnique({ where: { name } }),

  findByNameAr: async (nameAr: string): Promise<ServiceCategory | null> =>
    prisma.serviceCategory.findUnique({ where: { nameAr } }),

  update: async (id: string, data: UpdateServiceCategoryInput): Promise<ServiceCategory> =>
    prisma.serviceCategory.update({ where: { id }, data }),

  delete: async (id: string): Promise<void> => {
    await prisma.serviceCategory.delete({ where: { id } });
  },

  // services-design.md §3 delete-guard: mirrors categoriesRepository's
  // countAds — only ACTIVE listings block a category delete, matching
  // categoriesService's "Cannot delete category with N active ads" rule.
  countListings: async (id: string): Promise<number> =>
    prisma.serviceListing.count({ where: { categoryId: id, status: 'ACTIVE' } }),
};
