import { prisma } from '../../config/prisma';
import { AdStatus, AnalyticsEventType, UserActivityType, Prisma } from '@prisma/client';
import { AdListRow } from '../ads/ads.repository';

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
  condition: true,
  isNegotiable: true,
  status: true,
  views: true,
  viewsAtLastReport: true,
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

export const recommendationsRepository = {
  // Signal #1 (strongest): categories of ads the user has favorited.
  // Mirrors favoritesRepository.findManyByUserId's live-ad filter — a
  // favorite pointing at a since-deleted ad carries no usable category
  // signal.
  favoritedCategoryIds: async (userId: string): Promise<string[]> => {
    const rows = await prisma.favorite.findMany({
      where: { userId, ad: { status: { not: AdStatus.DELETED }, categoryId: { not: null } } },
      select: { ad: { select: { categoryId: true } } },
    });
    return rows.flatMap(r => (r.ad.categoryId ? [r.ad.categoryId] : []));
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
      where: { userId, type: UserActivityType.AD_CREATED, entityType: 'AD', entityId: { not: null } },
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
  excludedAdIds: async (userId: string): Promise<string[]> => {
    const [owned, favorited] = await Promise.all([
      prisma.ad.findMany({ where: { userId }, select: { id: true } }),
      prisma.favorite.findMany({ where: { userId }, select: { adId: true } }),
    ]);
    return [...owned.map(a => a.id), ...favorited.map(f => f.adId)];
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
    const whereParts: Prisma.Sql[] = [Prisma.sql`a."status" = ${AdStatus.ACTIVE}::"AdStatus"`];
    if (excludeIds.length > 0) {
      whereParts.push(Prisma.sql`a."id" NOT IN (${Prisma.join(excludeIds)})`);
    }
    const whereSql = Prisma.join(whereParts, ' AND ');

    const idRows = await prisma.$queryRaw<{ id: string }[]>`
      SELECT a."id"
      FROM "ads" a
      JOIN (VALUES ${weightValues}) AS w("categoryId", weight) ON w."categoryId" = a."categoryId"
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
    const where: Prisma.AdWhereInput = {
      status: AdStatus.ACTIVE,
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
