import { prisma } from '../../config/prisma';
import { AnalyticsEventType, Prisma } from '@prisma/client';
import { TrackEventInput } from './analytics.validation';
import { env } from '../../config/env';
import { runWithQueryTimeout } from '../../shared/utils/queryTimeout';

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
  // AUDIT-FIX 1.3: wrapped in runWithQueryTimeout — see that helper's
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

  // Distinct sessions that logged a SEARCH event vs. distinct sessions
  // that logged a CONTACT_CLICK event, in range — the two halves of the
  // "search → contact" conversion rate. Session-based rather than
  // event-count-based on purpose: a session searching 5 times and
  // contacting once is one converted session, not a 20% rate.
  searchToContactSessions: async (
    from: Date,
    to: Date
  ): Promise<{ searchSessions: number; contactSessions: number }> => {
    const [searchRows, contactRows] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where: { event: AnalyticsEventType.SEARCH, createdAt: { gte: from, lt: to } },
        distinct: ['sessionId'],
        select: { sessionId: true },
      }),
      prisma.analyticsEvent.findMany({
        where: { event: AnalyticsEventType.CONTACT_CLICK, createdAt: { gte: from, lt: to } },
        distinct: ['sessionId'],
        select: { sessionId: true },
      }),
    ]);
    return { searchSessions: searchRows.length, contactSessions: contactRows.length };
  },

  // Signup funnel: distinct sessions that started vs. completed signup
  // in range — the drop-off number the report flagged as missing.
  signupFunnelSessions: async (
    from: Date,
    to: Date
  ): Promise<{ startedSessions: number; completedSessions: number }> => {
    const [startedRows, completedRows] = await Promise.all([
      prisma.analyticsEvent.findMany({
        where: { event: AnalyticsEventType.SIGNUP_STARTED, createdAt: { gte: from, lt: to } },
        distinct: ['sessionId'],
        select: { sessionId: true },
      }),
      prisma.analyticsEvent.findMany({
        where: { event: AnalyticsEventType.SIGNUP_COMPLETED, createdAt: { gte: from, lt: to } },
        distinct: ['sessionId'],
        select: { sessionId: true },
      }),
    ]);
    return { startedSessions: startedRows.length, completedSessions: completedRows.length };
  },
};
