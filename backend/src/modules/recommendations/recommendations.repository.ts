import { prisma } from '../../config/prisma';
import {
  ActivityEntityType,
  AdStatus,
  AnalyticsEventType,
  UserActivityType,
  Prisma,
  ProductStatus,
  ServiceListingStatus,
} from '@prisma/client';
import { AdListRow } from '../ads/ads.repository';
import { ProductWithStore, productWithRelations } from '../products/products.repository';
import {
  ServiceListingWithProvider,
  listingWithRelations,
} from '../service-listings/service-listings.repository';

// Same column allowlist ads.repository.ts's adListSelect uses (and for
// the same reason — see that file's own PERF FIX comment): a
// recommendation rail renders exactly the AdCard shape the home page's
// other rails (FeaturedAds/RecentAds) already fetch, never the full
// `description` text. Duplicated here rather than imported because
// adListSelect isn't exported — re-declaring the same literal keeps
// this module free of a cross-module reach into ads.repository's
// private `const`, matching how favorites.repository.ts already
// duplicates its own favoriteListSelect instead of importing adListSelect.
const recommendationAdSelect = {
  id: true,
  title: true,
  price: true,
  images: true,
  city: true,
  latitude: true,
  longitude: true,
  condition: true,
  isNegotiable: true,
  status: true,
  views: true,
  viewsAtLastReport: true,
  isFeatured: true,
  isPinned: true,
  // Fraud detection (item 12): same reasoning as viewsAtLastReport
  // above — added the moment these two columns landed on Ad.
  riskScore: true,
  flaggedForReview: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  categoryId: true,
  sellerProfileId: true,
  user: { select: { id: true, name: true, city: true, avatarUrl: true } },
  category: { select: { id: true, name: true, nameAr: true } },
} as const;

export interface CategoryWeight {
  categoryId: string;
  weight: number;
}

// How far back each signal source looks. Favorites/activity are
// deliberately unbounded (a user's taste doesn't expire), but
// AnalyticsEvent is high-volume, anonymous-traffic-included telemetry
// (see analytics.repository.ts's own model comment) — capping the
// lookback keeps this a "what are you into lately" signal instead of
// scanning a user's entire multi-year view history on every request.
const VIEW_SIGNAL_LOOKBACK_DAYS = 30;

// FEAT-RECOMMENDATIONS-GENERALIZE (roadmap step 3): PRODUCT and
// SERVICE_LISTING both have a real categoryId (see Product/
// ServiceListing's own schema models) and DELETED-based soft-delete,
// same shape as Ad — so the AD weighted-category engine above
// generalizes to them directly. STORE does NOT (StoreDetails has no
// categoryId at all — confirmed against schema.prisma, not assumed),
// so it isn't included in this pass; a store recommendation rail
// needs its own signal design (most likely StoreFollower-based
// similarity, or category overlap of the store's own products) rather
// than a drop-in reuse of this category-weighting shape. That's step
// 5's "followed" signal, not this step.
//
// PR4A (recommendation view signals): the gap this comment used to
// document is closed — AnalyticsEventType.PRODUCT_VIEW/SERVICE_VIEW
// now exist (see schema.prisma), emitted from StoreProducts.tsx's
// `?product=` highlight effect and ServiceViewTracker.tsx respectively
// (mirroring how AD_VIEW is emitted from AdDetailSection.tsx). So
// PRODUCT/SERVICE_LISTING recommendations below now also read a
// recentlyViewedCategoryIds signal at WEIGHTS.viewed, same three-
// signal shape (favorited/created/viewed) the AD engine has always
// had — see productRecommendationsRepository.recentlyViewedCategoryIds
// and serviceListingRecommendationsRepository.recentlyViewedCategoryIds
// below, and recommendations.service.ts's getProductRecommendations/
// getServiceListingRecommendations for where they're wired in.

// PRODUCT/SERVICE_LISTING reuse productWithRelations/listingWithRelations
// (products.repository.ts / service-listings.repository.ts — already
// exported for favorites.repository.ts's PR2 fan-out) rather than a
// third local redeclaration, since those ARE exported (unlike
// adListSelect, which recommendationAdSelect above deliberately
// duplicates because it isn't).

export const productRecommendationsRepository = {
  // Signal #1: categories of products the user has favorited. Same
  // two-step fan-out favoritedCategoryIds (AD) uses — Favorite has no
  // Prisma relation to Product either.
  favoritedCategoryIds: async (userId: string): Promise<string[]> => {
    const favoriteRows = await prisma.favorite.findMany({
      where: { userId, entityType: 'PRODUCT' },
      select: { entityId: true },
    });
    if (favoriteRows.length === 0) return [];
    const products = await prisma.product.findMany({
      where: { id: { in: favoriteRows.map(r => r.entityId) }, status: { not: ProductStatus.DELETED } },
      select: { categoryId: true },
    });
    return products.map(p => p.categoryId);
  },

  // Signal #2: categories of products the user has created (their own
  // store's listings), from UserActivity's PRODUCT_CREATED rows — same
  // pattern as AD's createdAdCategoryIds.
  createdCategoryIds: async (userId: string): Promise<string[]> => {
    const rows = await prisma.userActivity.findMany({
      where: {
        userId,
        type: UserActivityType.PRODUCT_CREATED,
        entityType: ActivityEntityType.PRODUCT,
        entityId: { not: null },
      },
      select: { entityId: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const productIds = rows.flatMap(r => (r.entityId ? [r.entityId] : []));
    if (productIds.length === 0) return [];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { categoryId: true },
    });
    return products.map(p => p.categoryId);
  },

  // Signal #3 (PR4A): categories of products the user has recently
  // viewed, from AnalyticsEvent's PRODUCT_VIEW rows (metadata.productId
  // → resolved to a category below) — the PRODUCT counterpart of
  // recommendationsRepository.recentlyViewedCategoryIds (AD), same
  // VIEW_SIGNAL_LOOKBACK_DAYS window and same "raw SQL because Prisma
  // can't join on a JSON field" reasoning. Emitted from
  // StoreProducts.tsx's `?product=` highlight effect — see that
  // component's own comment for why that's this app's PRODUCT_VIEW
  // instrumentation point (no dedicated /products/[id] route exists).
  recentlyViewedCategoryIds: async (userId: string): Promise<string[]> => {
    const since = new Date(Date.now() - VIEW_SIGNAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<{ categoryId: string | null }[]>`
      SELECT p."categoryId" AS "categoryId"
      FROM "analytics_events" e
      JOIN "products" p ON p."id" = e.metadata->>'productId'
      WHERE e."userId" = ${userId}
        AND e."event" = ${AnalyticsEventType.PRODUCT_VIEW}::"AnalyticsEventType"
        AND e."createdAt" >= ${since}
      ORDER BY e."createdAt" DESC
      LIMIT 200
    `;
    return rows.flatMap(r => (r.categoryId ? [r.categoryId] : []));
  },

  excludedIds: async (userId: string): Promise<string[]> => {
    const [owned, favorited] = await Promise.all([
      // A product's owner is the store's seller, not the product row
      // itself — Product has no userId column (unlike Ad), so "owned"
      // here means "belongs to a store I own".
      prisma.product.findMany({
        where: { store: { sellerProfile: { userId } } },
        select: { id: true },
      }),
      prisma.favorite.findMany({ where: { userId, entityType: 'PRODUCT' }, select: { entityId: true } }),
    ]);
    return [...owned.map(p => p.id), ...favorited.map(f => f.entityId)];
  },

  // Same raw-SQL-for-a-shape-Prisma-can't-express reasoning as the AD
  // version — join chain here is products.storeId → store_details.id
  // → store_details.sellerProfileId → seller_profiles.id (confirmed
  // against schema.prisma's @@map directives), not the direct
  // one-hop Ad.sellerProfileId join AD's version uses.
  findByWeightedCategories: async (
    weights: CategoryWeight[],
    excludeIds: string[],
    limit: number
  ): Promise<ProductWithStore[]> => {
    if (weights.length === 0) return [];
    const weightValues = Prisma.join(
      weights.map(w => Prisma.sql`(${w.categoryId}, ${w.weight}::float)`)
    );
    const whereParts: Prisma.Sql[] = [
      Prisma.sql`p."status" = ${ProductStatus.ACTIVE}::"ProductStatus"`,
      Prisma.sql`sp."suspended" = false`,
    ];
    if (excludeIds.length > 0) {
      whereParts.push(Prisma.sql`p."id" NOT IN (${Prisma.join(excludeIds)})`);
    }
    const whereSql = Prisma.join(whereParts, ' AND ');

    const idRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT p."id"
      FROM "products" p
      JOIN (VALUES ${weightValues}) AS w("categoryId", weight) ON w."categoryId" = p."categoryId"
      JOIN "store_details" sd ON sd."id" = p."storeId"
      JOIN "seller_profiles" sp ON sp."id" = sd."sellerProfileId"
      WHERE ${whereSql}
      ORDER BY w.weight DESC, p."createdAt" DESC
      LIMIT ${limit}
    `;
    const ids = idRows.map(r => r.id);
    if (ids.length === 0) return [];
    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      include: productWithRelations,
    });
    const byId = new Map(products.map(p => [p.id, p]));
    return ids.flatMap(id => {
      const p = byId.get(id);
      return p ? [p] : [];
    });
  },

  findTrending: async (excludeIds: string[], limit: number): Promise<ProductWithStore[]> => {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      store: { sellerProfile: { suspended: false } },
      ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
    };
    return prisma.product.findMany({
      where,
      include: productWithRelations,
      orderBy: [{ views: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  },
};

export const serviceListingRecommendationsRepository = {
  favoritedCategoryIds: async (userId: string): Promise<string[]> => {
    const favoriteRows = await prisma.favorite.findMany({
      where: { userId, entityType: 'SERVICE_LISTING' },
      select: { entityId: true },
    });
    if (favoriteRows.length === 0) return [];
    const listings = await prisma.serviceListing.findMany({
      where: {
        id: { in: favoriteRows.map(r => r.entityId) },
        status: { not: ServiceListingStatus.DELETED },
      },
      select: { categoryId: true },
    });
    return listings.map(l => l.categoryId);
  },

  createdCategoryIds: async (userId: string): Promise<string[]> => {
    const rows = await prisma.userActivity.findMany({
      where: {
        userId,
        type: UserActivityType.SERVICE_CREATED,
        entityType: ActivityEntityType.SERVICE_LISTING,
        entityId: { not: null },
      },
      select: { entityId: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const listingIds = rows.flatMap(r => (r.entityId ? [r.entityId] : []));
    if (listingIds.length === 0) return [];
    const listings = await prisma.serviceListing.findMany({
      where: { id: { in: listingIds } },
      select: { categoryId: true },
    });
    return listings.map(l => l.categoryId);
  },

  // Signal #3 (PR4A): SERVICE_LISTING counterpart of
  // productRecommendationsRepository.recentlyViewedCategoryIds above —
  // same PRODUCT_VIEW→SERVICE_VIEW swap, reading
  // AnalyticsEventType.SERVICE_VIEW rows (metadata.serviceListingId).
  // Emitted from ServiceViewTracker.tsx, mounted on the public
  // /services/[id] detail page.
  recentlyViewedCategoryIds: async (userId: string): Promise<string[]> => {
    const since = new Date(Date.now() - VIEW_SIGNAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<{ categoryId: string | null }[]>`
      SELECT sl."categoryId" AS "categoryId"
      FROM "analytics_events" e
      JOIN "service_listings" sl ON sl."id" = e.metadata->>'serviceListingId'
      WHERE e."userId" = ${userId}
        AND e."event" = ${AnalyticsEventType.SERVICE_VIEW}::"AnalyticsEventType"
        AND e."createdAt" >= ${since}
      ORDER BY e."createdAt" DESC
      LIMIT 200
    `;
    return rows.flatMap(r => (r.categoryId ? [r.categoryId] : []));
  },

  excludedIds: async (userId: string): Promise<string[]> => {
    const [owned, favorited] = await Promise.all([
      // Same reasoning as productsRepository.excludedIds: a listing's
      // owner is the provider's seller, not a userId column on
      // ServiceListing itself.
      prisma.serviceListing.findMany({
        where: { provider: { sellerProfile: { userId } } },
        select: { id: true },
      }),
      prisma.favorite.findMany({
        where: { userId, entityType: 'SERVICE_LISTING' },
        select: { entityId: true },
      }),
    ]);
    return [...owned.map(l => l.id), ...favorited.map(f => f.entityId)];
  },

  // Join chain: service_listings.providerId → service_provider_details.id
  // → service_provider_details.sellerProfileId → seller_profiles.id
  // (confirmed against schema.prisma's @@map directives).
  findByWeightedCategories: async (
    weights: CategoryWeight[],
    excludeIds: string[],
    limit: number
  ): Promise<ServiceListingWithProvider[]> => {
    if (weights.length === 0) return [];
    const weightValues = Prisma.join(
      weights.map(w => Prisma.sql`(${w.categoryId}, ${w.weight}::float)`)
    );
    const whereParts: Prisma.Sql[] = [
      Prisma.sql`sl."status" = ${ServiceListingStatus.ACTIVE}::"ServiceListingStatus"`,
      Prisma.sql`sp."suspended" = false`,
    ];
    if (excludeIds.length > 0) {
      whereParts.push(Prisma.sql`sl."id" NOT IN (${Prisma.join(excludeIds)})`);
    }
    const whereSql = Prisma.join(whereParts, ' AND ');

    const idRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT sl."id"
      FROM "service_listings" sl
      JOIN (VALUES ${weightValues}) AS w("categoryId", weight) ON w."categoryId" = sl."categoryId"
      JOIN "service_provider_details" spd ON spd."id" = sl."providerId"
      JOIN "seller_profiles" sp ON sp."id" = spd."sellerProfileId"
      WHERE ${whereSql}
      ORDER BY w.weight DESC, sl."createdAt" DESC
      LIMIT ${limit}
    `;
    const ids = idRows.map(r => r.id);
    if (ids.length === 0) return [];
    const listings = await prisma.serviceListing.findMany({
      where: { id: { in: ids } },
      include: listingWithRelations,
    });
    const byId = new Map(listings.map(l => [l.id, l]));
    return ids.flatMap(id => {
      const l = byId.get(id);
      return l ? [l] : [];
    });
  },

  findTrending: async (excludeIds: string[], limit: number): Promise<ServiceListingWithProvider[]> => {
    const where: Prisma.ServiceListingWhereInput = {
      status: ServiceListingStatus.ACTIVE,
      provider: { sellerProfile: { suspended: false } },
      ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
    };
    return prisma.serviceListing.findMany({
      where,
      include: listingWithRelations,
      orderBy: [{ views: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  },
};

export const recommendationsRepository = {
  // Signal #1 (strongest): categories of ads the user has favorited.
  // Mirrors favoritesRepository.findManyByUserId's live-ad filter — a
  // favorite pointing at a since-deleted ad carries no usable category
  // signal.
  // FEAT-FAVORITE-POLYMORPHIC PR1: Favorite has no relation to Ad
  // anymore (see favorites.repository.ts's header comment), so this
  // can no longer filter/select through `ad:` in one Prisma call —
  // resolved as a two-step fan-out (favorite entityIds → matching
  // active ads), same "1 query for favorites + 1 for ads" shape
  // favorites.repository.ts's own findManyByUserId now uses. Scoped
  // to entityType: 'AD' — PR2 will need to also read PRODUCT/STORE/
  // SERVICE_LISTING favorites' categories once those exist.
  favoritedCategoryIds: async (userId: string): Promise<string[]> => {
    const favoriteRows = await prisma.favorite.findMany({
      where: { userId, entityType: 'AD' },
      select: { entityId: true },
    });
    if (favoriteRows.length === 0) return [];

    const ads = await prisma.ad.findMany({
      where: {
        id: { in: favoriteRows.map(r => r.entityId) },
        status: { not: AdStatus.DELETED },
        categoryId: { not: null },
      },
      select: { categoryId: true },
    });
    return ads.flatMap(a => (a.categoryId ? [a.categoryId] : []));
  },

  // Signal #2: categories the user has recently viewed or browsed, from
  // AnalyticsEvent's AD_VIEW (metadata.adId → resolved to a category
  // below) and CATEGORY_BROWSE (metadata.categoryId directly) events.
  // Raw SQL for the same reason analytics.repository.ts's topCategories
  // uses it: Prisma can't group by a JSON field.
  recentlyViewedCategoryIds: async (userId: string): Promise<string[]> => {
    const since = new Date(Date.now() - VIEW_SIGNAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    const [viewedAdRows, browsedRows] = await Promise.all([
      prisma.$queryRaw<{ categoryId: string | null }[]>`
        SELECT a."categoryId" AS "categoryId"
        FROM "analytics_events" e
        JOIN "ads" a ON a."id" = e.metadata->>'adId'
        WHERE e."userId" = ${userId}
          AND e."event" = ${AnalyticsEventType.AD_VIEW}::"AnalyticsEventType"
          AND e."createdAt" >= ${since}
        ORDER BY e."createdAt" DESC
        LIMIT 200
      `,
      prisma.$queryRaw<{ categoryId: string | null }[]>`
        SELECT metadata->>'categoryId' AS "categoryId"
        FROM "analytics_events"
        WHERE "userId" = ${userId}
          AND "event" = ${AnalyticsEventType.CATEGORY_BROWSE}::"AnalyticsEventType"
          AND "createdAt" >= ${since}
        ORDER BY "createdAt" DESC
        LIMIT 200
      `,
    ]);

    return [...viewedAdRows, ...browsedRows].flatMap(r => (r.categoryId ? [r.categoryId] : []));
  },

  // Signal #3: categories of the user's own past activity — ads they
  // created and ads they favorited, read from UserActivity instead of
  // a second live join. Gap #10's UserActivity rows carry entityId but
  // not categoryId directly (see that model's own comment on why it
  // avoids joins back into the source tables), so this resolves
  // entityId → categoryId for AD_CREATED rows only; FAVORITE_ADDED is
  // already covered more cheaply by favoritedCategoryIds above.
  createdAdCategoryIds: async (userId: string): Promise<string[]> => {
    const rows = await prisma.userActivity.findMany({
      where: { userId, type: UserActivityType.AD_CREATED, entityType: ActivityEntityType.AD, entityId: { not: null } },
      select: { entityId: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const adIds = rows.flatMap(r => (r.entityId ? [r.entityId] : []));
    if (adIds.length === 0) return [];

    const ads = await prisma.ad.findMany({
      where: { id: { in: adIds }, categoryId: { not: null } },
      select: { categoryId: true },
    });
    return ads.flatMap(a => (a.categoryId ? [a.categoryId] : []));
  },

  // Ads the user already has a relationship with — excluded from their
  // own recommendation rail the same way a "you might also like" shelf
  // on any marketplace never re-suggests what you already own or saved.
  // FEAT-FAVORITE-POLYMORPHIC PR1: adId is gone from Favorite's active
  // read path — use entityId, scoped to entityType: 'AD' (PR2 will
  // need equivalent PRODUCT/STORE/SERVICE_LISTING exclusion once
  // those favorite types exist and this rail recommends them too).
  excludedAdIds: async (userId: string): Promise<string[]> => {
    const [owned, favorited] = await Promise.all([
      prisma.ad.findMany({ where: { userId }, select: { id: true } }),
      prisma.favorite.findMany({ where: { userId, entityType: 'AD' }, select: { entityId: true } }),
    ]);
    return [...owned.map(a => a.id), ...favorited.map(f => f.entityId)];
  },

  // Core fetch: active ads in the given categories, ranked by the
  // caller-supplied per-category weight (favorite > created > viewed —
  // see recommendations.service.ts's WEIGHTS), then by recency/featured
  // status as tiebreakers. Prisma's `orderBy` can't sort by an
  // arbitrary case-when-category expression, so this uses raw SQL with
  // a VALUES-based weight table joined in, the same "raw SQL for a
  // shape Prisma's query builder can't express" rationale as
  // ads.repository.ts's search branch and search.repository.ts's
  // cross-entity UNION.
  findByWeightedCategories: async (
    weights: CategoryWeight[],
    excludeIds: string[],
    limit: number
  ): Promise<AdListRow[]> => {
    if (weights.length === 0) return [];

    const weightValues = Prisma.join(
      weights.map(w => Prisma.sql`(${w.categoryId}, ${w.weight}::float)`)
    );

    // Same whereParts-array + Prisma.join(..., ' AND ') composition
    // ads.repository.ts's search branch uses, rather than a conditional
    // Prisma.empty splice — keeps every WHERE fragment built the one
    // way this codebase already builds them.
    //
    // SEC-FIX: same suspended-seller leak as products/ads/service-
    // listings' findMany (see those repositories) — this raw query
    // filtered only on Ad.status, never on the seller's suspension
    // state, so a suspended seller's ads could still surface in a
    // recommendation rail even though they'd already dropped out of
    // every list/search result. Joined against seller_profiles (Ad has
    // a direct sellerProfileId, same one-hop relation ads.repository.ts
    // uses) rather than checked in a second round-trip, since this path
    // is already a raw query.
    const whereParts: Prisma.Sql[] = [
      Prisma.sql`a."status" = ${AdStatus.ACTIVE}::"AdStatus"`,
      Prisma.sql`sp."suspended" = false`,
    ];
    if (excludeIds.length > 0) {
      whereParts.push(Prisma.sql`a."id" NOT IN (${Prisma.join(excludeIds)})`);
    }
    const whereSql = Prisma.join(whereParts, ' AND ');

    const idRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT a."id"
      FROM "ads" a
      JOIN (VALUES ${weightValues}) AS w("categoryId", weight) ON w."categoryId" = a."categoryId"
      JOIN "seller_profiles" sp ON sp."id" = a."sellerProfileId"
      WHERE ${whereSql}
      ORDER BY w.weight DESC, a."isFeatured" DESC, a."createdAt" DESC
      LIMIT ${limit}
    `;

    const ids = idRows.map(r => r.id);
    if (ids.length === 0) return [];

    const ads = await prisma.ad.findMany({ where: { id: { in: ids } }, select: recommendationAdSelect });
    const byId = new Map(ads.map(a => [a.id, a]));
    // Preserve the ranked order from idRows — findMany's `in` filter
    // gives no ordering guarantee of its own (same pattern as
    // ads.repository.ts's findMany search branch re-ordering by `ids`).
    return ids.flatMap(id => {
      const ad = byId.get(id);
      return ad ? [ad] : [];
    });
  },

  // Fallback / anonymous-user source: platform-wide trending ads —
  // featured and pinned first, then most-viewed recently, same signal
  // shape as FeaturedAds.tsx's own client-side filter but done here so
  // it can also backfill a personalized rail that came up short.
  findTrending: async (excludeIds: string[], limit: number): Promise<AdListRow[]> => {
    // SEC-FIX: same suspended-seller leak as findByCategoryWeights
    // above — sellerProfile is Ad's direct belongs-to relation
    // (Ad.sellerProfileId), same relation filter ads.repository.ts's
    // findMany uses.
    const where: Prisma.AdWhereInput = {
      status: AdStatus.ACTIVE,
      sellerProfile: { suspended: false },
      ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
    };
    return prisma.ad.findMany({
      where,
      select: recommendationAdSelect,
      orderBy: [{ isPinned: 'desc' }, { isFeatured: 'desc' }, { views: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
  },
};
