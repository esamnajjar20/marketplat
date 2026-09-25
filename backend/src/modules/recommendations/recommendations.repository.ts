import { prisma } from '../../config/prisma';
import { runWithQueryTimeout } from '../../shared/utils/queryTimeout';
import { env } from '../../config/env';
import {
  ActivityEntityType,
  AdStatus,
  AnalyticsEventType,
  UserActivityType,
  Prisma,
  ProductStatus,
  ServiceListingStatus,
  StoreStatus,
  StorePlan,
} from '@prisma/client';
import { AdListRow } from '../ads/ads.repository';
import { ProductWithStore, productWithRelations } from '../products/products.repository';
import {
  ServiceListingWithProvider,
  listingWithRelations,
} from '../service-listings/service-listings.repository';
import { StoreWithSeller, storeWithSeller } from '../stores/stores.repository';

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
  pinnedByAdmin: true,
  // Fraud detection (item 12): same reasoning as viewsAtLastReport
  // above — added the moment these two columns landed on Ad.
  riskScore: true,
  flaggedForReview: true,
  createdAt: true,
  updatedAt: true,
  userId: true,
  categoryId: true,
  sellerProfileId: true,
  storeId: true,
  // FIX OFFLINE-IDEMPOTENCY-01: keep recommendationAdSelect a superset of Ad scalars
  offlineOperationId: true,
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

// PR5B: bounded trending composite score, shared by AD/PRODUCT/
// SERVICE_LISTING findTrending below (each repository's own
// findTrending calls rankTrendingCandidates — see that function's own
// comment for the two-pool fetch shape).
//
// Problem this replaces: every findTrending previously ordered purely
// by `views DESC` (then createdAt as a tiebreak). Lifetime `views` is
// monotonically increasing and never decays, so a brand-new listing
// with views = 0 sits behind every existing listing with even a
// single view — starvation, not "less popular".
//
// Fix: compute a bounded composite of (a) a diminishing-returns
// transform of views and (b) an age-based recency score, then re-sort
// by that composite instead of raw views. Computed in JS over a small
// already-fetched candidate pool rather than in SQL — this keeps
// findTrending's own `where` clause (and therefore this file's
// existing findTrending unit tests, which assert on that exact
// `where` object) completely unchanged, which is the smallest safe
// change that preserves current semantics per this task's own
// instruction, and it stays directly unit-testable without needing a
// live Postgres connection to exercise EXTRACT/NOW() SQL.
//
// viewsScore = views / (views + K), K = TRENDING_VIEWS_NORMALIZATION_CONSTANT
//   Bounded to [0, 1) with diminishing returns (at K views the score
//   is already 0.5) — a single very-high-view outlier can no longer
//   push its raw magnitude straight through unchecked the way a plain
//   `views DESC` sort would.
// recencyScore = 1 / (1 + ageDays / TRENDING_RECENCY_DECAY_DAYS)
//   Same bounded-decay shape PR5A's freshnessScore uses. Deliberately
//   a separate named constant from VIEW_SIGNAL_LOOKBACK_DAYS even
//   though both currently equal 30 — that one bounds an event-lookback
//   *window* (a hard cutoff on which AnalyticsEvent rows are read at
//   all); this one is a decay *rate* for scoring (no cutoff, just
//   smoothly shrinking influence). Coupling them via reuse would tie
//   two conceptually different knobs together for no reason.
const TRENDING_VIEWS_NORMALIZATION_CONSTANT = 10;
const TRENDING_RECENCY_DECAY_DAYS = 30;
const TRENDING_VIEWS_WEIGHT = 0.7;
const TRENDING_RECENCY_WEIGHT = 0.3;
// Size of each candidate pool findTrending fetches (see
// rankTrendingCandidates below) — comfortably above 24, the largest
// `limit` GET /recommendations accepts (recommendations.validation.ts),
// so the pool always has strictly more real candidates than could
// ever be requested in one call, without ever scanning/sorting the
// whole table.
const TRENDING_POOL_SIZE = 60;

interface TrendingCandidate {
  id: string;
  views: number;
  createdAt: Date;
}

const trendingCompositeScore = (candidate: TrendingCandidate, nowMs: number): number => {
  const viewsScore = candidate.views / (candidate.views + TRENDING_VIEWS_NORMALIZATION_CONSTANT);
  const ageDays = (nowMs - candidate.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  const recencyScore = 1 / (1 + ageDays / TRENDING_RECENCY_DECAY_DAYS);
  return viewsScore * TRENDING_VIEWS_WEIGHT + recencyScore * TRENDING_RECENCY_WEIGHT;
};

// Merges 1+ already-fetched candidate pools (deduped by id, first
// occurrence wins), then sorts by:
//   1. tierKeys(item), if given — an ordered array of booleans, each
//      compared most-significant-first, true sorts before false. Used
//      by AD's findTrending to keep isPinned/isFeatured as the same
//      two hard priority tiers they always were; PRODUCT/SERVICE_LISTING
//      pass no tierKeys since neither field exists on those models.
//   2. trendingCompositeScore DESC
//   3. createdAt DESC
//   4. id ASC — final deterministic tie-break, same convention PR5A's
//      findRanked uses, so two candidates identical on every signal
//      above (including createdAt, as in a test fixture) still return
//      in a stable, repeatable order.
// Then slices to `limit`. Pure/sync — this is what stays fully
// unit-testable without a live DB.
function rankTrendingCandidates<T extends TrendingCandidate>(
  pools: T[][],
  limit: number,
  tierKeys?: (item: T) => boolean[]
): T[] {
  const byId = new Map<string, T>();
  for (const pool of pools) {
    for (const item of pool) {
      if (!byId.has(item.id)) byId.set(item.id, item);
    }
  }
  const nowMs = Date.now();
  const items = Array.from(byId.values());
  items.sort((a, b) => {
    if (tierKeys) {
      const tiersA = tierKeys(a);
      const tiersB = tierKeys(b);
      for (let i = 0; i < tiersA.length; i += 1) {
        if (tiersA[i] !== tiersB[i]) return tiersA[i] ? -1 : 1;
      }
    }
    const scoreDiff = trendingCompositeScore(b, nowMs) - trendingCompositeScore(a, nowMs);
    if (scoreDiff !== 0) return scoreDiff;
    const createdAtDiff = b.createdAt.getTime() - a.createdAt.getTime();
    if (createdAtDiff !== 0) return createdAtDiff;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });
  return items.slice(0, limit);
}

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
// PR4B (store recommendations): that step 5 signal design now exists —
// see storeRecommendationsRepository at the bottom of this file. It is
// deliberately NOT built on the CategoryWeight/findByWeightedCategories
// engine above (StoreDetails still has no categoryId to weight by, and
// won't gain one — a store sells across many product categories, so a
// single categoryId would misrepresent it). Instead it ranks by signals
// StoreDetails and its neighbors actually carry: recent activity
// (store profile edits + its own active products' recency), geo
// distance when the caller supplies lat/lng, and a limited plan boost
// — see that block's own comment for the full design and why
// followed/favorited stores are read as an EXCLUSION signal rather
// than a similarity one (there is no store-level "taste" dimension to
// generalize from without inventing one).
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
      orderBy: { createdAt: 'desc' },
      take: FAVORITE_SIGNAL_TAKE,
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

  // PR5B: two bounded candidate pools instead of one views-sorted
  // page — see rankTrendingCandidates' own header comment for why.
  // topByViews keeps genuinely popular older products in the
  // candidate set; mostRecent guarantees a brand-new, zero-view
  // product is always a candidate for the composite score even though
  // it would never appear on a pure `views DESC` page. `where` is
  // unchanged from before PR5B — same object reused for both queries.
  findTrending: async (excludeIds: string[], limit: number): Promise<ProductWithStore[]> => {
    const where: Prisma.ProductWhereInput = {
      status: ProductStatus.ACTIVE,
      store: { sellerProfile: { suspended: false } },
      ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
    };
    const [topByViews, mostRecent] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productWithRelations,
        orderBy: [{ views: 'desc' }, { createdAt: 'desc' }],
        take: TRENDING_POOL_SIZE,
      }),
      prisma.product.findMany({
        where,
        include: productWithRelations,
        orderBy: [{ createdAt: 'desc' }],
        take: TRENDING_POOL_SIZE,
      }),
    ]);
    return rankTrendingCandidates([topByViews, mostRecent], limit);
  },
};

export const serviceListingRecommendationsRepository = {
  favoritedCategoryIds: async (userId: string): Promise<string[]> => {
    const favoriteRows = await prisma.favorite.findMany({
      where: { userId, entityType: 'SERVICE_LISTING' },
      select: { entityId: true },
      orderBy: { createdAt: 'desc' },
      take: FAVORITE_SIGNAL_TAKE,
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

  // PR5B: same two-pool shape as productRecommendationsRepository's
  // findTrending above — see rankTrendingCandidates' own comment.
  findTrending: async (excludeIds: string[], limit: number): Promise<ServiceListingWithProvider[]> => {
    const where: Prisma.ServiceListingWhereInput = {
      status: ServiceListingStatus.ACTIVE,
      provider: { sellerProfile: { suspended: false } },
      ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
    };
    const [topByViews, mostRecent] = await Promise.all([
      prisma.serviceListing.findMany({
        where,
        include: listingWithRelations,
        orderBy: [{ views: 'desc' }, { createdAt: 'desc' }],
        take: TRENDING_POOL_SIZE,
      }),
      prisma.serviceListing.findMany({
        where,
        include: listingWithRelations,
        orderBy: [{ createdAt: 'desc' }],
        take: TRENDING_POOL_SIZE,
      }),
    ]);
    return rankTrendingCandidates([topByViews, mostRecent], limit);
  },
};

// FIX RECO-FAVORITE-BOUND-01: the three *signal* uses of
// favorite.findMany (favoritedCategoryIds for products/services/ads)
// were unbounded -- a power user with thousands of favorites had every
// row loaded into memory, then a second findMany did an IN over the
// full id list, all to derive a set of categoryIds that top out at the
// number of active categories on the platform. 200 most-recent favorites
// is more than enough signal for "which categories do you lean toward",
// and stops the rail from paying O(favorites) on every request.
//
// Deliberately NOT applied to the *exclusion* uses (excludedIds /
// excludedAdIds): those must be complete, otherwise the rail starts
// recommending items the user already favorited. Correctness beats
// memory there; a separate optimization (exclusion index or a
// favorite-count cap) is the right fix if that ever becomes a
// bottleneck.
const FAVORITE_SIGNAL_TAKE = 200;

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
      orderBy: { createdAt: 'desc' },
      take: FAVORITE_SIGNAL_TAKE,
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
    limit: number,
    city?: string | null,
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
    const trimmedCity = city?.trim() || null;
    // أولوية المدينة: إعلانات نفس المدينة أولاً ثم وزن الفئة
    const cityOrder = trimmedCity
      ? Prisma.sql`CASE WHEN a."city" = ${trimmedCity} THEN 0 ELSE 1 END,`
      : Prisma.empty;

    const idRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT a."id"
      FROM "ads" a
      JOIN (VALUES ${weightValues}) AS w("categoryId", weight) ON w."categoryId" = a."categoryId"
      JOIN "seller_profiles" sp ON sp."id" = a."sellerProfileId"
      WHERE ${whereSql}
      ORDER BY ${cityOrder} w.weight DESC, a."isFeatured" DESC, a."createdAt" DESC
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
  //
  // PR5B: within the isPinned/isFeatured tiers (unchanged — those stay
  // the same two hard priority tiers they always were), views DESC is
  // replaced by the bounded composite score so a zero-view new ad
  // isn't starved behind every ad with even one view. Two bounded
  // candidate pools instead of one views-sorted page — see
  // rankTrendingCandidates' own comment for why.
  findTrending: async (
    excludeIds: string[],
    limit: number,
    city?: string | null,
  ): Promise<AdListRow[]> => {
    // SEC-FIX: same suspended-seller leak as findByCategoryWeights
    // above — sellerProfile is Ad's direct belongs-to relation
    // (Ad.sellerProfileId), same relation filter ads.repository.ts's
    // findMany uses.
    const baseWhere: Prisma.AdWhereInput = {
      status: AdStatus.ACTIVE,
      sellerProfile: { suspended: false },
      ...(excludeIds.length > 0 && { id: { notIn: excludeIds } }),
    };
    const trimmedCity = city?.trim() || null;

    // إن وُجدت مدينة: نملأ أولاً من نفس المدينة ثم نكمل من المنصة
    if (trimmedCity) {
      const cityWhere: Prisma.AdWhereInput = { ...baseWhere, city: trimmedCity };
      const [cityTop, cityRecent] = await Promise.all([
        prisma.ad.findMany({
          where: cityWhere,
          select: recommendationAdSelect,
          orderBy: [{ isPinned: 'desc' }, { isFeatured: 'desc' }, { views: 'desc' }, { createdAt: 'desc' }],
          take: TRENDING_POOL_SIZE,
        }),
        prisma.ad.findMany({
          where: cityWhere,
          select: recommendationAdSelect,
          orderBy: [{ isPinned: 'desc' }, { isFeatured: 'desc' }, { createdAt: 'desc' }],
          take: TRENDING_POOL_SIZE,
        }),
      ]);
      const cityRanked = rankTrendingCandidates(
        [cityTop, cityRecent],
        limit,
        ad => [ad.isPinned, ad.isFeatured],
      );
      if (cityRanked.length >= limit) return cityRanked;

      const cityIds = new Set(cityRanked.map(a => a.id));
      const restExclude = [...excludeIds, ...cityIds];
      const restWhere: Prisma.AdWhereInput = {
        status: AdStatus.ACTIVE,
        sellerProfile: { suspended: false },
        ...(restExclude.length > 0 && { id: { notIn: restExclude } }),
      };
      const remaining = limit - cityRanked.length;
      const [topByViews, mostRecent] = await Promise.all([
        prisma.ad.findMany({
          where: restWhere,
          select: recommendationAdSelect,
          orderBy: [{ isPinned: 'desc' }, { isFeatured: 'desc' }, { views: 'desc' }, { createdAt: 'desc' }],
          take: TRENDING_POOL_SIZE,
        }),
        prisma.ad.findMany({
          where: restWhere,
          select: recommendationAdSelect,
          orderBy: [{ isPinned: 'desc' }, { isFeatured: 'desc' }, { createdAt: 'desc' }],
          take: TRENDING_POOL_SIZE,
        }),
      ]);
      const rest = rankTrendingCandidates(
        [topByViews, mostRecent],
        remaining,
        ad => [ad.isPinned, ad.isFeatured],
      );
      return [...cityRanked, ...rest];
    }

    const [topByViews, mostRecent] = await Promise.all([
      prisma.ad.findMany({
        where: baseWhere,
        select: recommendationAdSelect,
        orderBy: [{ isPinned: 'desc' }, { isFeatured: 'desc' }, { views: 'desc' }, { createdAt: 'desc' }],
        take: TRENDING_POOL_SIZE,
      }),
      prisma.ad.findMany({
        where: baseWhere,
        select: recommendationAdSelect,
        orderBy: [{ isPinned: 'desc' }, { isFeatured: 'desc' }, { createdAt: 'desc' }],
        take: TRENDING_POOL_SIZE,
      }),
    ]);
    return rankTrendingCandidates([topByViews, mostRecent], limit, ad => [ad.isPinned, ad.isFeatured]);
  },
};

// PR4B (Store Recommendations) — audited against schema.prisma before
// writing any of this:
//   - StoreDetails: no categoryId (confirmed above and in
//     recommendations.repository.ts's header comment) — has status,
//     plan, latitude/longitude, views (lifetime counter, not an
//     AnalyticsEvent-backed signal), createdAt/updatedAt.
//   - StoreFollower: userId/storeId, no status column of its own.
//   - Favorite: entityType STORE already exists (FEAT-FAVORITE-
//     POLYMORPHIC PR1/PR2), same two-step fan-out shape used
//     everywhere else in this file (Favorite has no relation to any
//     entity table — resolved by entityId).
//   - AnalyticsEventType has PRODUCT_VIEW/SERVICE_VIEW (PR4A) but NO
//     STORE_VIEW — confirmed against schema.prisma's enum, not
//     assumed. A "recently viewed stores" signal is therefore NOT
//     implemented here: there is no event to read. Adding STORE_VIEW
//     (schema + migration + an emit point on the public store page)
//     is real, uncontroversial follow-up work, but it's a schema
//     change and an instrumentation decision this task explicitly
//     scoped out ("افصل إضافة STORE_VIEW كقرار/PR مستقل") — left as a
//     documented gap, not silently skipped and not guessed at.
//
// SIGNAL DESIGN — why this doesn't reuse CategoryWeight:
// Every other entity here ranks candidates by "which categories has
// this user shown interest in", because Ad/Product/ServiceListing
// each belong to exactly one category. A store doesn't belong to a
// category at all — it typically sells across several — so there is
// no honest single dimension to compute a per-user "store affinity
// weight" from without inventing one (e.g. "average category of a
// store's products" would silently misrepresent a general store).
// Rather than fake that similarity, followed/favorited stores are
// read as an EXCLUSION signal only — the same "don't re-recommend
// what the user already has a relationship with" role
// excludedAdIds/excludedIds play for the other three entities — and
// the RANKING itself is one honest, deterministic formula used for
// every caller alike (see findRanked below), not a personalized query
// backed by a trending fallback. That formula IS the fallback the
// task asked for ("activity/freshness + location + plan boost"); a
// logged-in user simply has more stores excluded from it (their own
// store, and ones they already follow/favorited) than an anonymous
// caller does. No random weights: every ORDER BY key below is either
// a real timestamp, a real distance in km, or a plain boolean
// tie-break — same "lexicographic multi-column ORDER BY" shape
// recommendationAdSelect's own findTrending already uses
// ([isPinned, isFeatured, views, createdAt]), just with different
// columns.
// PR5A: bounded composite score replacing the old lexicographic
// ORDER BY (freshness, distance, plan, createdAt). That chain let
// freshness dominate outright — two stores' freshness timestamps
// almost never tie, so distance/plan never got a real chance to
// break a freshness "tie" that in practice never happened. A weighted
// sum lets all three signals actually trade off against each other.
//
// Weights (caller supplied lat/lng, and the store itself has
// coordinates): freshness 0.45, distance 0.40, plan 0.15 — freshness
// and distance are deliberately close to each other (both real,
// continuous, evidence-based signals) while plan stays a minority
// "nudge" per the original design intent ("محدود" — limited, a
// tie-lean, not an override).
const STORE_FRESHNESS_WEIGHT_WITH_GEO = 0.45;
const STORE_DISTANCE_WEIGHT = 0.4;
const STORE_PLAN_WEIGHT_WITH_GEO = 0.15;
// No-geo weights (caller sent no lat/lng, OR sent lat/lng but this
// particular store has none — see hasStoreGeoExpr below): distance
// drops out entirely rather than defaulting to some contrived
// "neutral" distance value, and its 0.40 share is redistributed
// proportionally between the two remaining signals (0.45/0.60 * 0.75
// ≈ 0.5625 vs 0.15/0.60 * 0.75 ≈ 0.1875 — close enough to the flatly
// simple 0.75/0.25 split actually used; picking the simpler numbers
// keeps the formula legible without meaningfully changing behavior).
const STORE_FRESHNESS_WEIGHT_NO_GEO = 0.75;
const STORE_PLAN_WEIGHT_NO_GEO = 0.25;
// Decay divisor for distanceScore = 1 / (1 + distanceKm / 10) — at
// 10km a store's distance contribution is already halved, decaying
// smoothly toward 0 with no hard radius cutoff (PR5A explicitly asked
// for no cutoff — this is a ranking signal, not a filter).
const STORE_DISTANCE_SCORE_DECAY_KM = 10;

// freshnessScore = 1 / (1 + ageDays / 30) — reuses
// VIEW_SIGNAL_LOOKBACK_DAYS (declared above) rather than a second
// "30" constant, per this task's own instruction to not invent a
// parallel constant for the same number.
function storeFreshnessScoreExprSql(freshnessTimestampExpr: Prisma.Sql): Prisma.Sql {
  const ageDaysExpr = Prisma.sql`(EXTRACT(EPOCH FROM (NOW() - (${freshnessTimestampExpr}))) / 86400.0)`;
  return Prisma.sql`(1.0 / (1.0 + (${ageDaysExpr}) / ${VIEW_SIGNAL_LOOKBACK_DAYS}::float))`;
}

export interface StoreRankingParams {
  excludeIds: string[];
  lat?: number;
  lng?: number;
  limit: number;
}

export const storeRecommendationsRepository = {
  // Signal: stores this user already follows — StoreFollower is the
  // live relationship, read directly rather than via UserActivity's
  // STORE_FOLLOWED/STORE_UNFOLLOWED log (which would require replaying
  // follow/unfollow pairs to reconstruct current state; the join table
  // already IS current state).
  followedStoreIds: async (userId: string): Promise<string[]> => {
    const rows = await prisma.storeFollower.findMany({
      where: { userId },
      select: { storeId: true },
    });
    return rows.map(r => r.storeId);
  },

  // Signal: stores this user has favorited (Favorite.entityType STORE
  // — same read shape every other favoritedXCategoryIds/favoritedIds
  // method in this file already uses for its own entity type).
  favoritedStoreIds: async (userId: string): Promise<string[]> => {
    const rows = await prisma.favorite.findMany({
      where: { userId, entityType: 'STORE' },
      select: { entityId: true },
    });
    return rows.map(r => r.entityId);
  },

  // A user's own store should never appear in their own "stores you
  // might like" rail. StoreDetails has no direct userId column — same
  // one-hop-further relation productRecommendationsRepository.excludedIds
  // already joins through (store: { sellerProfile: { userId } }) — this
  // is that same join from the other side.
  ownStoreId: async (userId: string): Promise<string | null> => {
    const store = await prisma.storeDetails.findFirst({
      where: { sellerProfile: { userId } },
      select: { id: true },
    });
    return store?.id ?? null;
  },

  // Core ranked fetch — the one query both the personalized path (userId
  // resolved, some stores excluded) and the anonymous/no-signal fallback
  // path share; see this block's own header comment for why there's no
  // separate "trending" query to backfill from the way Ad/Product/
  // ServiceListing need.
  //
  // ACTIVE stores with a non-suspended seller only — same exclusion
  // shape as storesRepository.findMany's public directory (status:
  // 'ACTIVE', sellerProfile.suspended: false) — a BLOCKED/PENDING store
  // or one whose seller was suspended after the store went ACTIVE must
  // never surface in a recommendation rail any more than it surfaces
  // in the public directory.
  //
  // Ranking (deterministic, no invented weights beyond the three
  // fixed coefficients documented on the STORE_*_WEIGHT_* constants
  // above): a single bounded composite score, not a lexicographic
  // chain — see this file's PR5A header comment above for why the
  // lexicographic version let freshness dominate outright.
  //
  //   score = freshnessScore * W_fresh + distanceScore * W_dist + planScore * W_plan   (geo present, store has coords)
  //   score = freshnessScore * W_fresh_nogeo + planScore * W_plan_nogeo               (no geo, either side)
  //
  //   freshnessScore = 1 / (1 + ageDays / VIEW_SIGNAL_LOOKBACK_DAYS)
  //     ageDays from GREATEST(store.updatedAt, most recent ACTIVE
  //     product's createdAt) — same freshness-timestamp definition
  //     the old lexicographic version used (LEFT JOIN + GROUP BY
  //     sd."id" for the same "collapse multiple active products to
  //     one row" reason as before).
  //   distanceScore = 1 / (1 + distanceKm / 10), no radius cutoff —
  //     distanceKm from the same Haversine expression
  //     search.repository.ts's own haversineExprSql uses (duplicated,
  //     not imported — see this method's original doc comment on why).
  //   planScore = 1 for FEATURED, 0 for FREE.
  //
  // A store with no coordinates of its own still gets ranked by the
  // no-geo formula (never NULL, never excluded) even when the caller
  // DID supply lat/lng — hasStoreGeoExpr below is what selects the
  // right formula per row rather than per request.
  //
  // Tie-break after the composite score: store.createdAt DESC, then
  // sd."id" ASC as a final deterministic tie-break so two stores
  // identical on every signal above (including createdAt, in tests)
  // still return in a stable, repeatable order.
  findRanked: async (params: StoreRankingParams): Promise<StoreWithSeller[]> => {
    const { excludeIds, lat, lng, limit } = params;

    const whereParts: Prisma.Sql[] = [
      Prisma.sql`sd."status" = ${StoreStatus.ACTIVE}::"StoreStatus"`,
      Prisma.sql`sp."suspended" = false`,
    ];
    if (excludeIds.length > 0) {
      whereParts.push(Prisma.sql`sd."id" NOT IN (${Prisma.join(excludeIds)})`);
    }
    const whereSql = Prisma.join(whereParts, ' AND ');

    const hasGeo = lat !== undefined && lng !== undefined;
    // Same Haversine expression as search.repository.ts's
    // haversineExprSql — see this method's own doc comment above for
    // why it's duplicated rather than imported. NULL::float (not the
    // expression) when the caller supplied no lat/lng, so
    // distanceScoreExpr below is never even reached for that request.
    const distanceExprSql = hasGeo
      ? Prisma.sql`
          6371 * acos(
            LEAST(1, GREATEST(-1,
              cos(radians(${lat})) * cos(radians(sd."latitude")) *
              cos(radians(sd."longitude") - radians(${lng})) +
              sin(radians(${lat})) * sin(radians(sd."latitude"))
            ))
          )
        `
      : Prisma.sql`NULL::float`;

    const freshnessTimestampExpr = Prisma.sql`GREATEST(sd."updatedAt", COALESCE(MAX(p."createdAt"), sd."updatedAt"))`;
    const freshnessScoreExpr = storeFreshnessScoreExprSql(freshnessTimestampExpr);
    const distanceScoreExpr = Prisma.sql`(1.0 / (1.0 + (${distanceExprSql}) / ${STORE_DISTANCE_SCORE_DECAY_KM}::float))`;
    const planScoreExpr = Prisma.sql`(CASE WHEN sd."plan" = ${StorePlan.FEATURED}::"StorePlan" THEN 1.0 ELSE 0.0 END)`;
    const noGeoScoreExpr = Prisma.sql`((${freshnessScoreExpr}) * ${STORE_FRESHNESS_WEIGHT_NO_GEO}::float + (${planScoreExpr}) * ${STORE_PLAN_WEIGHT_NO_GEO}::float)`;
    // hasStoreGeoExpr is only ever evaluated when hasGeo is true (it's
    // nested inside the `hasGeo ?` branch below) — a request with no
    // lat/lng always takes noGeoScoreExpr unconditionally, per row,
    // regardless of whether that store happens to have coordinates.
    const hasStoreGeoExpr = Prisma.sql`(sd."latitude" IS NOT NULL AND sd."longitude" IS NOT NULL)`;
    const compositeScoreExpr = hasGeo
      ? Prisma.sql`(CASE WHEN ${hasStoreGeoExpr} THEN
          (${freshnessScoreExpr}) * ${STORE_FRESHNESS_WEIGHT_WITH_GEO}::float
          + (${distanceScoreExpr}) * ${STORE_DISTANCE_WEIGHT}::float
          + (${planScoreExpr}) * ${STORE_PLAN_WEIGHT_WITH_GEO}::float
        ELSE ${noGeoScoreExpr} END)`
      : noGeoScoreExpr;

    // T494 — this is the only recommendations raw query without a
    // pre-GROUP-BY LIMIT, and it does a LEFT JOIN + EXTRACT(EPOCH) +
    // composite-score CASE. As the store base grows, a slow scan here
    // holds a connection on the hot path a "similar stores" rail
    // triggers. Reuses the same bounded-set approach analytics already
    // uses for its own raw aggregates. The other six recommendations
    // queries are deliberately NOT wrapped — each already LIMITs before
    // any grouping, and wrapping them would tax every home-feed load
    // for no measurable benefit (see this session's analysis).
    const idRows = await runWithQueryTimeout(
      tx => tx.$queryRaw<{ id: string }[]>`
        SELECT sd."id"
        FROM "store_details" sd
        JOIN "seller_profiles" sp ON sp."id" = sd."sellerProfileId"
        LEFT JOIN "products" p ON p."storeId" = sd."id" AND p."status" = ${ProductStatus.ACTIVE}::"ProductStatus"
        WHERE ${whereSql}
        GROUP BY sd."id"
        ORDER BY
          (${compositeScoreExpr}) DESC,
          sd."createdAt" DESC,
          sd."id" ASC
        LIMIT ${limit}
      `,
      env.analytics.queryTimeoutMs,
    );

    const ids = idRows.map(r => r.id);
    if (ids.length === 0) return [];

    const stores = await prisma.storeDetails.findMany({
      where: { id: { in: ids } },
      include: storeWithSeller,
    });
    const byId = new Map(stores.map(s => [s.id, s]));
    // Preserve the ranked order from idRows — findMany's `in` filter
    // gives no ordering guarantee, same reasoning as every other
    // findByWeightedCategories/findRanked in this file.
    return ids.flatMap(id => {
      const store = byId.get(id);
      return store ? [store] : [];
    });
  },
};
