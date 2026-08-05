import { prisma } from '../../config/prisma';
import { getPaginationParams } from '../../shared/utils/pagination';
import { AdStatus, Prisma } from '@prisma/client';
import { CreateAdInput, UpdateAdInput, GetAdsQuery, AdSortField } from './ads.validation';

export type AdWithAuthor = Prisma.AdGetPayload<{
  include: {
    user: { select: { id: true; name: true; city: true; avatarUrl: true } };
    category: { select: { id: true; name: true; nameAr: true } };
  };
}>;

const adWithRelations = {
  user: { select: { id: true, name: true, city: true, avatarUrl: true } },
  category: { select: { id: true, name: true, nameAr: true } },
} as const;

// PERF FIX (audit finding #3): list endpoints (findMany, findManyByUserId,
// findRelated) previously used `include: adWithRelations`, which adds
// relations but does NOT restrict Ad's own scalar columns — so the full
// `description` text (often the largest field on the row) was serialized
// for every ad in every page of results, even though the frontend's
// AdListItem = Omit<Ad, 'description'> never reads it. That's dead weight
// over the wire on every list/search/my-ads/related-ads response, which
// matters most exactly when it hurts most: slow/metered connections.
// `findById` (single ad detail page) still uses adWithRelations below,
// since that view legitimately needs the full description.
export type AdListRow = Omit<AdWithAuthor, 'description'>;

const adListSelect = {
  id: true,
  title: true,
  price: true,
  images: true,
  city: true,
  condition: true,
  isNegotiable: true,
  status: true,
  views: true,
  isFeatured: true,
  isPinned: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  categoryId: true,
  sellerProfileId: true,
  user: { select: { id: true, name: true, city: true, avatarUrl: true } },
  category: { select: { id: true, name: true, nameAr: true } },
} as const;

// L-3 (audit fix): built from Record<AdSortField, ...> instead of the
// old inline ternary chain (sortBy === 'price' ? ... : sortBy === 'views'
// ? ... : default). A Record keyed by the full AdSortField union means
// TypeScript itself rejects this file at compile time if AD_SORT_FIELDS
// in ads.validation.ts ever gains a value with no matching entry here —
// the exact "forgot to update the raw-SQL path" drift the audit flagged
// (previously only the ORM path's `{ [sortBy]: sortOrder }` picked up
// new fields automatically, and a forgotten raw-SQL branch fell back to
// createdAt silently, not a build error). Prisma.raw is still needed
// because column names can't be parameterized as query values.
const AD_SORT_COLUMN_SQL: Record<AdSortField, Prisma.Sql> = {
  createdAt: Prisma.raw('"createdAt"'),
  price: Prisma.raw('"price"'),
  views: Prisma.raw('"views"'),
};

export const adsRepository = {
  // sellerProfileId: passed by ads.service.ts's createAd once the caller
  // is confirmed to have a SellerProfile — see sellers.service.ts's
  // ensureSellerProfileForAdCreation. userId (above) remains the sole
  // source of truth for ownership/permission checks; this is a stats-only
  // reference (see seller-profile-design.md §2).
  create: async (
    userId: string,
    data: CreateAdInput,
    images: string[],
    sellerProfileId: string
  ): Promise<AdWithAuthor> =>
    prisma.ad.create({
      data: { ...data, userId, images, sellerProfileId },
      include: adWithRelations,
    }),

  // FIX AUDIT-V5-01: used to enforce MAX_ADS_PER_USER before creating a
  // new ad. Counts ACTIVE only — SOLD/DELETED ads don't count against
  // the cap, so a user can always free up a slot by marking an old ad
  // sold or deleting it rather than being permanently stuck at the limit.
  // Uses the existing [userId, status] composite index — O(log n) lookup,
  // not a table scan.
  countActiveByUserId: async (userId: string): Promise<number> =>
    prisma.ad.count({ where: { userId, status: AdStatus.ACTIVE } }),

  findMany: async (query: GetAdsQuery): Promise<{ ads: AdListRow[]; total: number }> => {
    const {
      page = 1,
      limit = 20,
      city,
      categoryId,
      search,
      minPrice,
      maxPrice,
      condition,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;
    const { skip, take } = getPaginationParams(page, limit);

    if (search) {
      const whereParts: Prisma.Sql[] = [
        Prisma.sql`"status" = ${AdStatus.ACTIVE}::"AdStatus"`,
        // FIX SEARCH-AR-01: both sides of tsvector @@ tsquery now go
        // through arabic_normalize() — the column expression must match
        // ads_search_idx byte-for-byte (same reasoning as the coalesce()
        // comment above), and the search TERM must go through the same
        // function too, or a user typing e.g. أ (hamza) would never
        // match a listing indexed with plain ا — only one side of the
        // comparison would be normalized otherwise. See the
        // arabic_search_normalization migration for the full rationale
        // on which letter-shape variants are folded together.
        Prisma.sql`(
          setweight(to_tsvector('simple', arabic_normalize(coalesce("title", ''))), 'A') ||
          setweight(to_tsvector('simple', arabic_normalize(coalesce("description", ''))), 'B')
        ) @@ plainto_tsquery('simple', arabic_normalize(${search}))`,
      ];

      // FIX PERF-01: city ILIKE '%value%' can never use the existing
      // [status, city] B-tree index — a leading wildcard forces a full
      // scan of every ACTIVE row regardless of how many rows match
      // status alone. The frontend only ever sends city as an exact
      // value from a fixed 10-city <select> (lib/constants.ts CITIES),
      // never free text, so there's no free-text-search reason to pay
      // that cost — an exact match hits the index directly.
      if (city) whereParts.push(Prisma.sql`"city" = ${city}`);
      if (categoryId) whereParts.push(Prisma.sql`"categoryId" = ${categoryId}`);
      if (condition) whereParts.push(Prisma.sql`"condition" = ${condition}::"AdCondition"`);
      if (minPrice !== undefined) whereParts.push(Prisma.sql`"price" >= ${minPrice}`);
      if (maxPrice !== undefined) whereParts.push(Prisma.sql`"price" <= ${maxPrice}`);

      const whereSql = Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}`;
      // FIX H-1 (previously): 'views' became a valid sortBy value in
      // ads.validation.ts, fixing the silent createdAt fallback for it.
      // L-3 (audit fix, this pass): sortColumn now comes from
      // AD_SORT_COLUMN_SQL, a Record<AdSortField, Sql> defined above from
      // the same AD_SORT_FIELDS enum ads.validation.ts uses for sortBy —
      // so this can no longer independently drift the way the H-1 bug
      // happened in the first place. sortBy is already validated
      // upstream (Zod enum), so the lookup below is exhaustive by
      // construction; no default branch to silently fall through.
      const sortColumn = AD_SORT_COLUMN_SQL[sortBy];
      const sortDirection = sortOrder === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');

      const [idRows, countRows] = await Promise.all([
        prisma.$queryRaw<{ id: string }[]>`
          SELECT "id"
          FROM "ads"
          ${whereSql}
          ORDER BY "isPinned" DESC, "isFeatured" DESC, ${sortColumn} ${sortDirection}
          OFFSET ${skip}
          LIMIT ${take}
        `,
        prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*)::bigint AS count
          FROM "ads"
          ${whereSql}
        `,
      ]);

      const ids = idRows.map(row => row.id);
      if (ids.length === 0) {
        return { ads: [], total: Number(countRows[0]?.count ?? 0) };
      }

      const ads = await prisma.ad.findMany({
        where: { id: { in: ids } },
        select: adListSelect,
      });
      const adsById = new Map(ads.map(ad => [ad.id, ad]));

      return {
        ads: ids.flatMap(id => {
          const ad = adsById.get(id);
          return ad ? [ad] : [];
        }),
        total: Number(countRows[0]?.count ?? 0),
      };
    }

    const where: Prisma.AdWhereInput = {
      status: AdStatus.ACTIVE,
      // FIX PERF-01: exact match, not contains — see the identical fix
      // in the search-branch above for why this is safe (fixed city
      // list from the frontend) and why contains defeats the
      // [status, city] index.
      ...(city && { city }),
      ...(categoryId && { categoryId }),
      ...(condition && { condition }),
      // AUDIT-FIX L-01: the `search` branch above already returns
      // early via $queryRaw + to_tsvector full-text search, so this
      // where-clause (used only for the non-search list/filter path)
      // can never be reached with `search` truthy — removed the dead
      // `...(search && {...})` spread that previously lived here.
      ...((minPrice !== undefined || maxPrice !== undefined) && {
        price: {
          ...(minPrice !== undefined && { gte: minPrice }),
          ...(maxPrice !== undefined && { lte: maxPrice }),
        },
      }),
    };

    const orderBy: Prisma.AdOrderByWithRelationInput[] = [
      { isPinned: 'desc' },
      { isFeatured: 'desc' },
      { [sortBy]: sortOrder },
    ];

    // D-05: read-only batches don't need $transaction — use Promise.all instead
    const [ads, total] = await Promise.all([
      prisma.ad.findMany({ where, select: adListSelect, orderBy, skip, take }),
      prisma.ad.count({ where }),
    ]);

    return { ads, total };
  },

  findById: async (id: string): Promise<AdWithAuthor | null> =>
    prisma.ad.findUnique({ where: { id }, include: adWithRelations }),

  findManyByUserId: async (
    userId: string,
    query: GetAdsQuery & { statusFilter?: AdStatus }
  ): Promise<{ ads: AdListRow[]; total: number }> => {
    const { page = 1, limit = 20, statusFilter } = query;
    const { skip, take } = getPaginationParams(page, limit); // A-06
    // S-05: statusFilter='ACTIVE' for public profiles — prevents total from leaking SOLD count
    const where: Prisma.AdWhereInput = {
      userId,
      status: statusFilter ? statusFilter : { not: AdStatus.DELETED },
    };

    // D-05: read-only, no transaction needed
    const [ads, total] = await Promise.all([
      prisma.ad.findMany({
        where,
        select: adListSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.ad.count({ where }),
    ]);

    return { ads, total };
  },

  findRelated: async (
    adId: string,
    categoryId: string | null,
    city: string,
    limit = 6
  ): Promise<AdListRow[]> => {
    const where: Prisma.AdWhereInput = {
      id: { not: adId },
      status: AdStatus.ACTIVE,
      OR: [...(categoryId ? [{ categoryId }] : []), { city }],
    };
    return prisma.ad.findMany({
      where,
      select: adListSelect,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  update: async (id: string, data: UpdateAdInput): Promise<AdWithAuthor> =>
    prisma.ad.update({ where: { id }, data, include: adWithRelations }),

  // D-02: atomic array append using PostgreSQL array_append via raw SQL
  // Eliminates the SELECT + UPDATE race condition.
  //
  // FIX (image ordering): the previous query unioned existing + new images
  // with no ORDER BY before LIMIT, so PostgreSQL was free to interleave them
  // unpredictably, and overflow could silently drop EXISTING images instead
  // of capping new ones. This version tags each image with its source
  // (0 = existing, 1 = new) and original position (via WITH ORDINALITY),
  // orders by (source, position) so existing images always come first in
  // their original order — new images fill remaining slots in upload order —
  // then re-aggregates with an explicit row number so the final array order
  // is deterministic rather than relying on unspecified aggregate behavior.
  addImages: async (id: string, newImages: string[], maxImages = 10): Promise<AdWithAuthor> => {
    const placeholders = newImages.map((_, i) => `$${i + 2}`).join(', ');

    await prisma.$executeRawUnsafe(
      `UPDATE "ads"
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

    const updated = await prisma.ad.findUniqueOrThrow({ where: { id }, include: adWithRelations });
    return updated;
  },

  // D-02: atomic image removal — no read-before-write race
  removeImage: async (id: string, imageUrl: string): Promise<AdWithAuthor> => {
    await prisma.$executeRaw`
      UPDATE "ads"
      SET "images" = array_remove("images", ${imageUrl})
      WHERE "id" = ${id}
    `;
    return prisma.ad.findUniqueOrThrow({ where: { id }, include: adWithRelations });
  },

  incrementViews: async (id: string): Promise<void> => {
    await prisma.ad.update({ where: { id }, data: { views: { increment: 1 } } });
  },

  softDelete: async (id: string): Promise<void> => {
    await prisma.ad.update({ where: { id }, data: { status: AdStatus.DELETED } });
  },
};
