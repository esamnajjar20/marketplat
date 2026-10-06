import { prisma } from '../../config/prisma';
import { Prisma, StoreCollection } from '@prisma/client';

// COLLECTIONS (P1): the storefront tab needs each collection's product
// count and cover image without pulling every member row, so
// withCounts/withPreview are the two shapes callers actually need —
// mirrors storesRepository's separate "withSellerAndCounts" include
// rather than a single kitchen-sink query used everywhere.
const withProductCount = {
  _count: { select: { products: true } },
} satisfies Prisma.StoreCollectionInclude;

export type StoreCollectionWithCount = Prisma.StoreCollectionGetPayload<{
  include: typeof withProductCount;
}>;

export const collectionsRepository = {
  create: (data: {
    storeId: string;
    name: string;
    slug: string;
    description?: string;
    imageUrl?: string;
    sortOrder?: number;
  }): Promise<StoreCollection> =>
    prisma.storeCollection.create({
      data: {
        storeId: data.storeId,
        name: data.name,
        slug: data.slug,
        description: data.description,
        imageUrl: data.imageUrl,
        sortOrder: data.sortOrder ?? 0,
      },
    }),

  findById: (id: string): Promise<StoreCollection | null> =>
    prisma.storeCollection.findUnique({ where: { id } }),

  findBySlugInStore: (storeId: string, slug: string): Promise<StoreCollection | null> =>
    prisma.storeCollection.findUnique({ where: { storeId_slug: { storeId, slug } } }),

  // Owner-facing list — includes inactive collections and the raw
  // product count, ordered the same way the owner last arranged them.
  findByStoreId: (storeId: string): Promise<StoreCollectionWithCount[]> =>
    // same rationale as promotions'
    // findByStoreId.
    prisma.storeCollection.findMany({
      where: { storeId },
      include: withProductCount,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    }),

  // Public-facing list — active only, same ordering.
  findActiveByStoreId: (storeId: string): Promise<StoreCollectionWithCount[]> =>
    prisma.storeCollection.findMany({
      where: { storeId, isActive: true },
      include: withProductCount,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),

  update: (
    id: string,
    data: Partial<{
      name: string;
      slug: string;
      description: string | null;
      imageUrl: string | null;
      sortOrder: number;
      isActive: boolean;
    }>
  ): Promise<StoreCollection> => prisma.storeCollection.update({ where: { id }, data }),

  // Hard delete — a collection has no history worth keeping once
  // removed (unlike Promotion's cancel-not-delete convention, which
  // exists to preserve usageCount/audit data this table has none of).
  // The join rows cascade via the FK's ON DELETE CASCADE.
  delete: (id: string): Promise<StoreCollection> => prisma.storeCollection.delete({ where: { id } }),

  reorder: (storeId: string, orderedIds: string[]): Promise<Prisma.BatchPayload[]> =>
    prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.storeCollection.updateMany({
          where: { id, storeId },
          data: { sortOrder: index },
        })
      )
    ),

  isUniqueConstraintError: (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',

  // T405 — same predicate but scoped to the (collectionId, productId)
  // membership uniqueness; addProduct races against isMember and this
  // is the catch that turns a benign "two add-the-same-product"
  // collision into a no-op instead of a 500.
  isMembershipConflict: (error: unknown): boolean =>
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002',

  // --- Membership (StoreCollectionProduct) ---

  findMemberIds: (collectionId: string): Promise<string[]> =>
    prisma.storeCollectionProduct
      .findMany({ where: { collectionId }, select: { productId: true }, orderBy: { sortOrder: 'asc' } })
      .then(rows => rows.map(r => r.productId)),

  isMember: (collectionId: string, productId: string): Promise<boolean> =>
    prisma.storeCollectionProduct
      .findUnique({ where: { collectionId_productId: { collectionId, productId } } })
      .then(row => row !== null),

  addProduct: (collectionId: string, productId: string, sortOrder: number): Promise<void> =>
    prisma.storeCollectionProduct
      .create({ data: { collectionId, productId, sortOrder } })
      .then(() => undefined),

  removeProduct: (collectionId: string, productId: string): Promise<void> =>
    prisma.storeCollectionProduct
      .delete({ where: { collectionId_productId: { collectionId, productId } } })
      .then(() => undefined),

  // Products visible on the collection's own storefront tab — only
  // ACTIVE ones, same status filter productsRepository's public
  // listing uses, so a collection never surfaces a product the owner
  // has paused/deleted elsewhere.
  // T404 — bounded like promotions/collections list queries. A
  // collection realistically holds tens of products; 500 keeps a
  // pathological case from returning an unbounded page.
  findVisibleProducts: (collectionId: string) =>
    prisma.storeCollectionProduct.findMany({
      where: { collectionId, product: { status: 'ACTIVE' } },
      include: { product: true },
      orderBy: { sortOrder: 'asc' },
      take: 500,
    }),

  nextSortOrder: async (collectionId: string): Promise<number> => {
    const last = await prisma.storeCollectionProduct.findFirst({
      where: { collectionId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  },
};
