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

  // EPIC 1.2: admin management view — unlike the public findMany above,
  // this must NOT filter by isActive (an admin needs to see and
  // re-activate a deactivated category, not just the public subset),
  // and includes ad counts per category the same way
  // categoriesRepository's admin tree does (see AdminCategoriesTree.tsx's
  // cat._count.ads usage) so the admin UI can warn before a delete that
  // would be rejected by the listingsCount > 0 guard in
  // service-categories.service.ts's deleteServiceCategory.
  findManyForAdmin: async (): Promise<
    Array<
      ServiceCategory & {
        children: Array<ServiceCategory & { _count: { listings: number } }>;
        _count: { listings: number };
      }
    >
  > =>
    prisma.serviceCategory.findMany({
      where: { parentId: null },
      include: {
        children: {
          orderBy: { name: 'asc' },
          include: { _count: { select: { listings: true } } },
        },
        _count: { select: { listings: true } },
      },
      orderBy: { name: 'asc' },
    }),

  findById: async (id: string): Promise<ServiceCategory | null> =>
    prisma.serviceCategory.findUnique({ where: { id }, include: { children: true } }),

  // T441 — this module previously had NO cycle guard on update (unlike
  // categoriesRepository and productCategoriesRepository which both
  // ship findParentChain). A parentId pointing at the category itself
  // or at one of its own descendants would introduce an infinite loop
  // in any code that walks the chain or recurses into children.
  // Capped at 100 hops as a defensive backstop.
  findParentChain: async (startId: string): Promise<string[]> => {
    const chain: string[] = [];
    let currentId: string | null = startId;
    let hops = 0;
    while (currentId && hops < 100) {
      const node: { id: string; parentId: string | null } | null =
        await prisma.serviceCategory.findUnique({
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

  // T443 — same guard the sibling modules have: a category with
  // subcategories must not be hard-deleted, or the FK constraint on
  // children.parentId would surface as an unhandled 500.
  countChildren: async (id: string): Promise<number> =>
    prisma.serviceCategory.count({ where: { parentId: id } }),

  // T443 companion — a category referenced by an active broadcast is
  // also unsafe to hard-delete (FK constraint on
  // ServiceRequestBroadcast.categoryId). Same shape as countListings.
  countBroadcasts: async (id: string): Promise<number> =>
    prisma.serviceRequestBroadcast.count({ where: { categoryId: id } }),

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
