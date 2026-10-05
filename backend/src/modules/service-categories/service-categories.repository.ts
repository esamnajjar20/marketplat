import { prisma } from '../../config/prisma';
import { Prisma, ServiceCategory } from '@prisma/client';
import { CreateServiceCategoryInput, UpdateServiceCategoryInput } from './service-categories.validation';

export type ServiceCategoryWithChildren = ServiceCategory & { children?: ServiceCategory[] };

export const serviceCategoriesRepository = {
  create: async (data: CreateServiceCategoryInput): Promise<ServiceCategory> =>
    prisma.serviceCategory.create({ data: data as unknown as Prisma.ServiceCategoryUncheckedCreateInput }),

  // Only active top-level categories (+ their children) for the public
  // browse tree — same shape as categoriesRepository.findMany, but also
  // filters isActive since service_categories supports soft-deactivation
  // (services-design.md §3), which "categories" does not have.
  findMany: async (): Promise<ServiceCategoryWithChildren[]> =>
    prisma.serviceCategory.findMany({
      where: { parentId: null, isActive: true },
      include: { children: { where: { isActive: true } }, serviceType: { select: { id: true, slug: true, nameAr: true, icon: true } } },
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

  // Admin/ownership path — deliberately unfiltered so an admin editing
  // or deleting a deactivated category still resolves it.
  findById: async (id: string): Promise<ServiceCategory | null> =>
    prisma.serviceCategory.findUnique({ where: { id }, include: { children: true, serviceType: { select: { id: true, slug: true, nameAr: true, icon: true } } } }),

  // T510 — public read path (getServiceCategoryById). isActive is
  // enforced so a deactivated category can't be reached at
  // /service-categories/:id even though the browse tree already hides
  // it. Children filtered to active too, matching findMany's shape.
  findPublicById: async (id: string): Promise<ServiceCategory | null> =>
    prisma.serviceCategory.findUnique({
      where: { id, isActive: true },
      include: { children: { where: { isActive: true } }, serviceType: { select: { id: true, slug: true, nameAr: true, icon: true } } },
    }),

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

  // T510 — findBySlug is only ever called from the public
  // getServiceCategoryBySlug, so isActive is enforced directly rather
  // than adding a parallel findPublicBySlug.
  findBySlug: async (slug: string): Promise<ServiceCategory | null> =>
    prisma.serviceCategory.findUnique({ where: { slug, isActive: true } }),

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

  // A service-type change is a data-integrity operation, so paused/deleted
  // listings still count: their historical serviceTypeId must remain aligned
  // with the category even when they are not publicly discoverable.

  countAllListings: async (id: string): Promise<number> =>
    prisma.serviceListing.count({ where: { categoryId: id } }),

  // Listing creation locks the category row so an admin cannot change its
  // serviceTypeId between validation and the listing insert.
  lockForListingCreation: async (
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<{ isActive: boolean; serviceTypeId: string } | null> => {
    const rows = await tx.$queryRaw<Array<{ isActive: boolean; serviceTypeId: string }>>`
      SELECT "isActive", "serviceTypeId"
      FROM "service_categories"
      WHERE "id" = ${id}
      FOR UPDATE
    `;
    return rows.length ? rows[0] : null;
  },
};
