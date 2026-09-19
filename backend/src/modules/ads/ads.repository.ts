import { prisma } from '../../config/prisma';
import { getPaginationParams } from '../../shared/utils/pagination';
import { analyzeSearchQuery } from '../../shared/utils/searchQueryIntelligence';
import { AdStatus, Prisma } from '@prisma/client';
import { CreateAdInput, UpdateAdInput, GetAdsQuery, AdSortField } from './ads.validation';
import { MAX_IMAGES_PER_ENTITY } from '../../config/limits';

export type AdWithAuthor = Prisma.AdGetPayload<{
  include: {
    user: { select: { id: true; name: true; city: true; avatarUrl: true } };
    category: { select: { id: true; name: true; nameAr: true } };
  };
}>;

const adWithRelations = {
  user: { select: { id: true, name: true, city: true, avatarUrl: true } },
  category: { select: { id: true, name: true, nameAr: true } },
  // UX trust-on-card: lightweight seller signals for AdCard (not full profile).
  sellerProfile: {
    select: {
      verified: true,
      averageRating: true,
      totalRatings: true,
    },
  },
  store: {
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      status: true,
    },
  },
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
  // TRACK-NEARBY-SEARCH: adListSelect must stay a superset of
  // AdWithAuthor's scalars (see viewsAtLastReport's comment above) —
  // added the moment these two columns landed on the Ad model.
  latitude: true,
  longitude: true,
  condition: true,
  isNegotiable: true,
  status: true,
  views: true,
  // Added alongside the viewsAtLastReport migration: adListSelect is an
  // explicit column allowlist, and AdListRow is derived from
  // AdWithAuthor (a full-model Prisma.AdGetPayload via `include`, which
  // — unlike `select` — doesn't restrict scalar columns). Every new
  // scalar added to the Ad model therefore has to be added here too,
  // or TS correctly fails the build the moment the model gains one
  // (found by the build after the viewsAtLastReport migration). This
  // field isn't needed by the frontend list view; it's included solely
  // to keep this select's shape a superset of AdWithAuthor's scalars.
  viewsAtLastReport: true,
  isFeatured: true,
  isPinned: true,
  pinnedByAdmin: true,
  // Fraud detection (item 12): same "adListSelect must be a superset
  // of AdWithAuthor's scalars" rule as viewsAtLastReport's own comment
  // above — added the moment these two columns landed on the Ad model.
  riskScore: true,
  flaggedForReview: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  categoryId: true,
  sellerProfileId: true,
  storeId: true,
  user: { select: { id: true, name: true, city: true, avatarUrl: true } },
  category: { select: { id: true, name: true, nameAr: true } },
  // UX trust-on-card: lightweight seller signals for AdCard (not full profile).
  sellerProfile: {
    select: {
      verified: true,
      averageRating: true,
      totalRatings: true,
    },
  },
  store: {
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      status: true,
    },
  },
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
      isFeatured,
      storeId,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query as typeof query & { storeId?: string };
    const { skip, take } = getPaginationParams(page, limit);

    if (search) {
      // SEARCH-INTEL-01: expand synonyms / dialect / light morphology
      // into to_tsquery OR-groups (same helper as unified search).
      const { tsQueryString } = analyzeSearchQuery(search);
      const effectiveTs = tsQueryString ?? search;
      const whereParts: Prisma.Sql[] = [
        Prisma.sql`"status" = ${AdStatus.ACTIVE}::"AdStatus"`,
        // AUDIT-FIX (ads-feature review): the SEC-FIX below (see the
        // plain where-clause branch further down) hides ads from
        // suspended sellers via `sellerProfile: { suspended: false }` —
        // but that's an ORM relation filter, which this branch (raw SQL,
        // used by both GET /ads?search= and GET /ads/search) never went
        // through, so a suspended seller's ads were still fully
        // searchable even after suspension. Same fix, raw-SQL form:
        // IN (SELECT id ...) excludes both suspended sellers' ads AND
        // (matching the ORM's null-relation behavior) legacy ads with no
        // linked seller profile at all, keeping this branch's semantics
        // identical to the non-search branch rather than introducing a
        // second, slightly different definition of "hidden".
        Prisma.sql`"sellerProfileId" IN (SELECT "id" FROM "seller_profiles" WHERE "suspended" = false)`,
        // AUDIT-FIX (store BLOCKED): store-published ads must leave public
        // search when the store is not ACTIVE (fraud/moderation), matching
        // products.repository.ts. Personal ads (storeId IS NULL) stay visible
        // unless the seller profile is suspended (filter above).
        Prisma.sql`(
          "storeId" IS NULL
          OR "storeId" IN (SELECT "id" FROM "store_details" WHERE "status" = 'ACTIVE')
        )`,
        // FIX SEARCH-AR-01 + SEARCH-INTEL-01: arabic_normalize on both
        // sides; to_tsquery carries synonym OR-groups from analyzeSearchQuery.
        Prisma.sql`(
          setweight(to_tsvector('simple', arabic_normalize(coalesce("title", ''))), 'A') ||
          setweight(to_tsvector('simple', arabic_normalize(coalesce("description", ''))), 'B')
        ) @@ to_tsquery('simple', arabic_normalize(${effectiveTs}))`,
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
      if (storeId) whereParts.push(Prisma.sql`"storeId" = ${storeId}`);
      if (condition) whereParts.push(Prisma.sql`"condition" = ${condition}::"AdCondition"`);
      if (minPrice !== undefined) whereParts.push(Prisma.sql`"price" >= ${minPrice}`);
      if (maxPrice !== undefined) whereParts.push(Prisma.sql`"price" <= ${maxPrice}`);
      // FIX FEAT-06: same param, search-branch side — see the plain
      // where-clause branch below for the full rationale.
      if (isFeatured !== undefined) whereParts.push(Prisma.sql`"isFeatured" = ${isFeatured}`);

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
      ...(storeId ? { storeId } : {}),
      // SEC-FIX: same gap as products.repository.ts's findMany — an
      // admin suspending a seller only ever blocked that seller from
      // *creating* new ads (see ads.service.ts's ForbiddenError check
      // on create), never removed their already-published ads from
      // public listings. sellerProfile here is Ad's direct belongs-to
      // relation (Ad.sellerProfileId), not a nested chain like
      // products' store.sellerProfile, so this is a single relation
      // filter rather than two.
      sellerProfile: { suspended: false },
      // AUDIT-FIX (store BLOCKED): hide store ads when store is not ACTIVE.
      // Personal ads (no store) keep using sellerProfile.suspended only.
      AND: [
        {
          OR: [
            { storeId: null },
            { store: { status: 'ACTIVE' } },
          ],
        },
      ],
      // FIX PERF-01: exact match, not contains — see the identical fix
      // in the search-branch above for why this is safe (fixed city
      // list from the frontend) and why contains defeats the
      // [status, city] index.
      ...(city && { city }),
      ...(categoryId && { categoryId }),
      ...(condition && { condition }),
      // FIX FEAT-06: previously there was no server-side way to ask for
      // only featured ads — FeaturedAds.tsx (frontend) fetched a fixed
      // page of the default-sorted list (which already sorts isPinned
      // DESC, isFeatured DESC — see orderBy below) and filtered
      // isFeatured client-side. That broke once fewer than the page
      // size were actually featured: the featured ones could be pushed
      // past the fetched window by newer non-featured ads, or the
      // section could show nothing at all even though featured ads
      // existed elsewhere in the sorted list. Filtering here means the
      // count returned is always accurate regardless of how large the
      // marketplace grows.
      ...(isFeatured !== undefined && { isFeatured }),
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

  // FIX BUG-06/BUG-07 (dashboard stats, superseded): DashboardStats.tsx
  // previously computed activeAds/soldAds/totalViews by fetching up to
  // 100 of the user's ads (getAdsSchema's own max page size) and
  // reducing them client-side — a seller with more than 100 ads still
  // got silently wrong numbers, just at a higher threshold than the
  // original bug (page-default 20) it replaced. This runs real
  // aggregations instead: groupBy for per-status counts (index-backed
  // by the existing [userId, status] composite index — same index
  // countActiveByUserId above already relies on) and a single SUM for
  // views, both scoped server-side to this user's non-deleted ads.
  // Correct at any ad count, one request, no page-size ceiling.
  getStatsByUserId: async (
    userId: string
  ): Promise<{ activeAds: number; soldAds: number; totalViews: number }> => {
    const [statusCounts, viewsAgg] = await Promise.all([
      prisma.ad.groupBy({
        by: ['status'],
        where: { userId, status: { not: AdStatus.DELETED } },
        _count: { _all: true },
      }),
      prisma.ad.aggregate({
        _sum: { views: true },
        where: { userId, status: { not: AdStatus.DELETED } },
      }),
    ]);

    const activeAds = statusCounts.find((s) => s.status === AdStatus.ACTIVE)?._count._all ?? 0;
    const soldAds = statusCounts.find((s) => s.status === AdStatus.SOLD)?._count._all ?? 0;
    const totalViews = viewsAgg._sum.views ?? 0;

    return { activeAds, soldAds, totalViews };
  },

  findManyByUserId: async (
    userId: string,
    query: GetAdsQuery & { statusFilter?: AdStatus; personalOnly?: boolean; storeId?: string }
  ): Promise<{ ads: AdListRow[]; total: number }> => {
    const { page = 1, limit = 20, statusFilter, personalOnly, storeId } = query as GetAdsQuery & {
      statusFilter?: AdStatus;
      personalOnly?: boolean;
      storeId?: string;
    };
    const { skip, take } = getPaginationParams(page, limit); // A-06
    // personalOnly: public seller profile — hide store-published ads
    // storeId: ads belonging to a store storefront
    const where: Prisma.AdWhereInput = {
      ...(storeId ? { storeId } : { userId }),
      ...(personalOnly && !storeId ? { storeId: null } : {}),
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
      // AUDIT-FIX (ads-feature review): same SEC-FIX as findMany's plain
      // where-clause branch — a suspended seller's ads were still being
      // recommended in every other ad's "related ads" section, one of
      // the two gaps (alongside the search branch above) the SEC-FIX
      // comment on the non-search branch never actually covered.
      sellerProfile: { suspended: false },
      AND: [
        {
          OR: [
            { storeId: null },
            { store: { status: 'ACTIVE' } },
          ],
        },
      ],
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
  addImages: async (id: string, newImages: string[], maxImages = MAX_IMAGES_PER_ENTITY): Promise<AdWithAuthor> => {
    // FIX RAW-SQL-MAXIMAGES-GUARD-01: maxImages is interpolated
    // directly into the SQL as `LIMIT ${safeMaxImages}` below — it cannot
    // be a bound parameter without restructuring the whole statement,
    // and a future caller passing an attacker-controlled number would
    // be a SQL injection vector. Every current call site uses the
    // module constant, but the guard here means this function can
    // never become an injection sink even if that changes. The 100 cap
    // is generous (MAX_IMAGES_PER_ENTITY is 10) and matches the same
    // "trust nothing that lands in the SQL string" discipline as
    // queryTimeout.ts's safeTimeoutMs.
    const safeMaxImages =
      Number.isInteger(maxImages) && maxImages > 0 && maxImages <= 100
        ? maxImages
        : MAX_IMAGES_PER_ENTITY;
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
           LIMIT ${safeMaxImages}
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

  // Gap #11: reorderImages is a full-array replace, unlike
  // addImages/removeImage above — there's no existing/new split to
  // reconcile, so a plain UPDATE (no raw-SQL array surgery) is both
  // correct and simpler. The caller (ads.service.ts) is responsible for
  // verifying orderedImages is a permutation of the current images
  // before this ever runs; this method trusts its input.
  reorderImages: async (id: string, orderedImages: string[]): Promise<AdWithAuthor> =>
    prisma.ad.update({ where: { id }, data: { images: orderedImages }, include: adWithRelations }),

  incrementViews: async (id: string): Promise<void> => {
    await prisma.ad.update({ where: { id }, data: { views: { increment: 1 } } });
  },

  softDelete: async (id: string): Promise<void> => {
    await prisma.ad.update({ where: { id }, data: { status: AdStatus.DELETED } });
  },
};
