import { prisma } from '../../config/prisma';
import { AnalyticsEventType, Prisma } from '@prisma/client';
import { TrackEventInput } from './analytics.validation';
import { env } from '../../config/env';
import { runWithQueryTimeout } from '../../shared/utils/queryTimeout';

// the two funnel-count queries now use
// COUNT(DISTINCT sessionId) + runWithQueryTimeout (was findMany +
// distinct + .length, unbounded and timeout-unprotected).

export interface EventCount {
  event: AnalyticsEventType;
  count: number;
}

export interface TrendPoint {
  bucket: Date;
  event: AnalyticsEventType;
  count: number;
}

export interface CategoryBrowseCount {
  categoryId: string;
  count: number;
}

export const analyticsRepository = {
  // Fire-and-forget from the controller (see analytics.service.ts) —
  // createMany over N individual creates: one insert statement instead
  // of N round-trips for what's usually a small same-page-load batch.
  createMany: async (
    events: TrackEventInput[],
    userId: string | null
  ): Promise<void> => {
    await prisma.analyticsEvent.createMany({
      data: events.map(e => ({
        event: e.event,
        sessionId: e.sessionId,
        userId,
        metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        path: e.path,
        referrer: e.referrer,
      })),
    });
  },

  // Total count per event type in [from, to) — the headline numbers
  // (total page views, searches, ad views, contact clicks) the summary
  // card row is built from.
  countByEvent: async (from: Date, to: Date): Promise<EventCount[]> => {
    const rows = await prisma.analyticsEvent.groupBy({
      by: ['event'],
      where: { createdAt: { gte: from, lt: to } },
      _count: { _all: true },
    });
    return rows.map(r => ({ event: r.event, count: r._count._all }));
  },

  // Time-series trend, bucketed by day or week, one row per
  // (bucket, event) pair — feeds the dashboard's line chart. Raw SQL
  // because Prisma's groupBy can't bucket a DateTime column; date_trunc
  // is the standard Postgres way to do this without pulling every row
  // back and bucketing in application code.
  // wrapped in runWithQueryTimeout — see that helper's
  // doc comment. A wide admin-selected [from, to) range times out
  // cleanly (AnalyticsQueryTimeoutError -> 503) instead of holding a
  // connection indefinitely.
  trendByEvent: async (
    from: Date,
    to: Date,
    bucket: 'day' | 'week'
  ): Promise<TrendPoint[]> => {
    const rows = await runWithQueryTimeout(
      tx =>
        tx.$queryRaw<{ bucket: Date; event: AnalyticsEventType; count: bigint }[]>`
          SELECT date_trunc(${bucket}, "createdAt") AS bucket, "event", COUNT(*) AS count
          FROM "analytics_events"
          WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
          GROUP BY 1, 2
          ORDER BY 1 ASC
        `,
      env.analytics.queryTimeoutMs
    );
    return rows.map(r => ({ bucket: r.bucket, event: r.event, count: Number(r.count) }));
  },

  // Most-browsed categories in range, derived from CATEGORY_BROWSE
  // events' metadata->categoryId. Raw SQL: Prisma can't group by a JSON
  // field. Capped to top 20 — this feeds a "top categories" list, not a
  // full report.
  topCategories: async (from: Date, to: Date, limit = 20): Promise<CategoryBrowseCount[]> => {
    const rows = await runWithQueryTimeout(
      tx =>
        tx.$queryRaw<{ categoryId: string; count: bigint }[]>`
          SELECT metadata->>'categoryId' AS "categoryId", COUNT(*) AS count
          FROM "analytics_events"
          WHERE "event" = 'CATEGORY_BROWSE'
            AND "createdAt" >= ${from} AND "createdAt" < ${to}
            AND metadata->>'categoryId' IS NOT NULL
          GROUP BY 1
          ORDER BY count DESC
          LIMIT ${limit}
        `,
      env.analytics.queryTimeoutMs
    );
    return rows.map(r => ({ categoryId: r.categoryId, count: Number(r.count) }));
  },

  // was findMany + distinct + .length for
  // each half — Prisma's distinct ran at the DB, then N distinct
  // sessionIds were materialized into memory and shipped over the wire
  // just to call .length on them. On a wide admin range (year-long), that
  // is an unbounded number of rows for a single int result, and neither
  // half was wrapped in runWithQueryTimeout (unlike trendByEvent and
  // topCategories, which already are). COUNT(DISTINCT sessionId) returns
  // one row, uses the same index class, and gets the same timeout
  // treatment as the rest of this repository.
  searchToContactSessions: async (
    from: Date,
    to: Date
  ): Promise<{ searchSessions: number; contactSessions: number }> => {
    const [searchRows, contactRows] = await Promise.all([
      runWithQueryTimeout(
        tx =>
          tx.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(DISTINCT "sessionId") AS count
            FROM "analytics_events"
            WHERE "event" = 'SEARCH'
              AND "createdAt" >= ${from} AND "createdAt" < ${to}
          `,
        env.analytics.queryTimeoutMs
      ),
      runWithQueryTimeout(
        tx =>
          tx.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(DISTINCT "sessionId") AS count
            FROM "analytics_events"
            WHERE "event" = 'CONTACT_CLICK'
              AND "createdAt" >= ${from} AND "createdAt" < ${to}
          `,
        env.analytics.queryTimeoutMs
      ),
    ]);
    return {
      searchSessions: Number(searchRows[0]?.count ?? 0),
      contactSessions: Number(contactRows[0]?.count ?? 0),
    };
  },

  // (part 2): same shape/rationale as
  // searchToContactSessions above -- COUNT(DISTINCT sessionId) + timeout
  // instead of materializing N distinct sessionIds to call .length on
  // them.
  signupFunnelSessions: async (
    from: Date,
    to: Date
  ): Promise<{ startedSessions: number; completedSessions: number }> => {
    const [startedRows, completedRows] = await Promise.all([
      runWithQueryTimeout(
        tx =>
          tx.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(DISTINCT "sessionId") AS count
            FROM "analytics_events"
            WHERE "event" = 'SIGNUP_STARTED'
              AND "createdAt" >= ${from} AND "createdAt" < ${to}
          `,
        env.analytics.queryTimeoutMs
      ),
      runWithQueryTimeout(
        tx =>
          tx.$queryRaw<{ count: bigint }[]>`
            SELECT COUNT(DISTINCT "sessionId") AS count
            FROM "analytics_events"
            WHERE "event" = 'SIGNUP_COMPLETED'
              AND "createdAt" >= ${from} AND "createdAt" < ${to}
          `,
        env.analytics.queryTimeoutMs
      ),
    ]);
    return {
      startedSessions: Number(startedRows[0]?.count ?? 0),
      completedSessions: Number(completedRows[0]?.count ?? 0),
    };
  },
};
