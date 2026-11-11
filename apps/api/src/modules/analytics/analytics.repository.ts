import { prisma } from '../../config/prisma';
import { AnalyticsEventType, Prisma } from '@prisma/client';
import { TrackEventInput } from './analytics.validation';
import { env } from '../../config/env';
import { runWithQueryTimeout } from '../../shared/db/queryTimeout';

// Summary aggregates and distinct-session funnels run inside bounded
// transactions. The rollup-aware summary queries keep Express Fallback in
// parity with Go when raw event retention is shorter than the requested range.

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

const utcMidnight = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

// Mirror analyticsrollup.FullDayRange in Go. A partial day must remain on raw
// events so an arbitrary [from,to) request keeps its exact inclusive/exclusive
// timestamp boundaries.
const fullUtcDayRange = (from: Date, to: Date): { start: Date; end: Date } => {
  let start = utcMidnight(from);
  if (start.getTime() !== from.getTime()) {
    start.setUTCDate(start.getUTCDate() + 1);
  }
  const end = utcMidnight(to);
  return { start, end: end < start ? start : end };
};

const hasDailyRollupTables = async (tx: Prisma.TransactionClient): Promise<boolean> => {
  const rows = await tx.$queryRaw<Array<{ ready: boolean }>>`
    SELECT to_regclass('analytics_event_daily_rollups') IS NOT NULL
       AND to_regclass('analytics_rollup_days') IS NOT NULL AS ready
  `;
  return rows[0]?.ready === true;
};

export const analyticsRepository = {
  // Fire-and-forget from the controller (see analytics.service.ts) —
  // createMany over N individual creates: one insert statement instead
  // of N round-trips for what's usually a small same-page-load batch.
  createMany: async (events: TrackEventInput[], userId: string | null): Promise<void> => {
    await prisma.analyticsEvent.createMany({
      data: events.map(e => ({
        ...(e.eventId ? { id: e.eventId } : {}),
        event: e.event,
        sessionId: e.sessionId,
        userId,
        metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        path: e.path,
        referrer: e.referrer,
      })),
      // A Go commit may succeed while its HTTP response is lost. The same
      // event IDs are then replayed through Express; the primary key makes
      // that fallback idempotent instead of double-counting the event.
      skipDuplicates: true,
    });
  },

  // Totals, trends, and categories use completed UTC daily rollups where
  // possible. Partial edge dates and any date lacking a completion marker are
  // read from raw events. Funnels deliberately remain raw DISTINCT queries.
  countByEvent: async (from: Date, to: Date): Promise<EventCount[]> => {
    return runWithQueryTimeout(async tx => {
      const { start, end } = fullUtcDayRange(from, to);
      const useRollups = start < end && await hasDailyRollupTables(tx);
      const rows = useRollups
        ? await tx.$queryRaw<Array<{ event: AnalyticsEventType; count: bigint }>>`
            WITH counts AS (
              SELECT r."event"::text AS event, SUM(r."eventCount")::bigint AS count
              FROM "analytics_event_daily_rollups" r
              JOIN "analytics_rollup_days" d ON d."bucketDate" = r."bucketDate"
              WHERE r."bucketDate" >= ${start}::date AND r."bucketDate" < ${end}::date
              GROUP BY r."event"
              UNION ALL
              SELECT e."event"::text AS event, COUNT(*)::bigint AS count
              FROM "analytics_events" e
              WHERE e."createdAt" >= ${from} AND e."createdAt" < ${to}
                AND NOT EXISTS (
                  SELECT 1 FROM "analytics_rollup_days" d
                  WHERE d."bucketDate" = e."createdAt"::date
                    AND d."bucketDate" >= ${start}::date AND d."bucketDate" < ${end}::date
                )
              GROUP BY e."event"
            )
            SELECT event::"AnalyticsEventType" AS event, SUM(count)::bigint AS count
            FROM counts GROUP BY event
          `
        : await tx.$queryRaw<Array<{ event: AnalyticsEventType; count: bigint }>>`
            SELECT "event", COUNT(*)::bigint AS count
            FROM "analytics_events"
            WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
            GROUP BY "event"
          `;
      return rows.map(row => ({ event: row.event, count: Number(row.count) }));
    }, env.analytics.queryTimeoutMs);
  },

  trendByEvent: async (from: Date, to: Date, bucket: 'day' | 'week'): Promise<TrendPoint[]> => {
    return runWithQueryTimeout(async tx => {
      const { start, end } = fullUtcDayRange(from, to);
      const useRollups = start < end && await hasDailyRollupTables(tx);
      const rows = useRollups
        ? await tx.$queryRaw<Array<{ bucket: Date; event: AnalyticsEventType; count: bigint }>>`
            WITH points AS (
              SELECT date_trunc(${bucket}, r."bucketDate"::timestamp) AS bucket,
                     r."event"::text AS event, SUM(r."eventCount")::bigint AS count
              FROM "analytics_event_daily_rollups" r
              JOIN "analytics_rollup_days" d ON d."bucketDate" = r."bucketDate"
              WHERE r."bucketDate" >= ${start}::date AND r."bucketDate" < ${end}::date
              GROUP BY 1, 2
              UNION ALL
              SELECT date_trunc(${bucket}, e."createdAt") AS bucket,
                     e."event"::text AS event, COUNT(*)::bigint AS count
              FROM "analytics_events" e
              WHERE e."createdAt" >= ${from} AND e."createdAt" < ${to}
                AND NOT EXISTS (
                  SELECT 1 FROM "analytics_rollup_days" d
                  WHERE d."bucketDate" = e."createdAt"::date
                    AND d."bucketDate" >= ${start}::date AND d."bucketDate" < ${end}::date
                )
              GROUP BY 1, 2
            )
            SELECT bucket, event::"AnalyticsEventType" AS event, SUM(count)::bigint AS count
            FROM points GROUP BY bucket, event ORDER BY bucket ASC
          `
        : await tx.$queryRaw<Array<{ bucket: Date; event: AnalyticsEventType; count: bigint }>>`
            SELECT date_trunc(${bucket}, "createdAt") AS bucket, "event", COUNT(*)::bigint AS count
            FROM "analytics_events"
            WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
            GROUP BY 1, 2
            ORDER BY 1 ASC
          `;
      return rows.map(row => ({ bucket: row.bucket, event: row.event, count: Number(row.count) }));
    }, env.analytics.queryTimeoutMs);
  },

  topCategories: async (from: Date, to: Date, limit = 20): Promise<CategoryBrowseCount[]> => {
    return runWithQueryTimeout(async tx => {
      const { start, end } = fullUtcDayRange(from, to);
      const useRollups = start < end && await hasDailyRollupTables(tx);
      const rows = useRollups
        ? await tx.$queryRaw<Array<{ categoryId: string; count: bigint }>>`
            WITH category_counts AS (
              SELECT r."categoryId" AS "categoryId", SUM(r."eventCount")::bigint AS count
              FROM "analytics_event_daily_rollups" r
              JOIN "analytics_rollup_days" d ON d."bucketDate" = r."bucketDate"
              WHERE r."event" = 'CATEGORY_BROWSE' AND r."categoryId" <> ''
                AND r."bucketDate" >= ${start}::date AND r."bucketDate" < ${end}::date
              GROUP BY r."categoryId"
              UNION ALL
              SELECT e.metadata->>'categoryId' AS "categoryId", COUNT(*)::bigint AS count
              FROM "analytics_events" e
              WHERE e."event" = 'CATEGORY_BROWSE'
                AND e."createdAt" >= ${from} AND e."createdAt" < ${to}
                AND e.metadata->>'categoryId' IS NOT NULL
                AND e.metadata->>'categoryId' <> ''
                AND NOT EXISTS (
                  SELECT 1 FROM "analytics_rollup_days" d
                  WHERE d."bucketDate" = e."createdAt"::date
                    AND d."bucketDate" >= ${start}::date AND d."bucketDate" < ${end}::date
                )
              GROUP BY e.metadata->>'categoryId'
            ), totals AS (
              SELECT "categoryId", SUM(count)::bigint AS count
              FROM category_counts GROUP BY "categoryId"
            )
            SELECT "categoryId", count FROM totals
            ORDER BY count DESC LIMIT ${limit}
          `
        : await tx.$queryRaw<Array<{ categoryId: string; count: bigint }>>`
            SELECT metadata->>'categoryId' AS "categoryId", COUNT(*)::bigint AS count
            FROM "analytics_events"
            WHERE "event" = 'CATEGORY_BROWSE'
              AND "createdAt" >= ${from} AND "createdAt" < ${to}
              AND metadata->>'categoryId' IS NOT NULL
              AND metadata->>'categoryId' <> ''
            GROUP BY 1
            ORDER BY count DESC
            LIMIT ${limit}
          `;
      return rows.map(row => ({ categoryId: row.categoryId, count: Number(row.count) }));
    }, env.analytics.queryTimeoutMs);
  },

  // was findMany + distinct + .length for
  // each half — Prisma's distinct ran at the DB, then N distinct
  // sessionIds were materialized into memory and shipped over the wire
  // just to call .length on them. COUNT(DISTINCT sessionId) returns one row
  // and receives the same bounded statement timeout as summary aggregates.
  searchToContactSessions: async (
    from: Date,
    to: Date
  ): Promise<{ searchSessions: number; contactSessions: number }> => {
    // One bounded database round-trip computes both funnel endpoints. The
    // FILTER clauses keep each distinct-session count scoped to its own event.
    const rows = await runWithQueryTimeout(
      tx =>
        tx.$queryRaw<{ searchSessions: bigint; contactSessions: bigint }[]>`
          SELECT
            COUNT(DISTINCT "sessionId") FILTER (WHERE "event" = 'SEARCH') AS "searchSessions",
            COUNT(DISTINCT "sessionId") FILTER (WHERE "event" = 'CONTACT_CLICK') AS "contactSessions"
          FROM "analytics_events"
          WHERE "event" IN ('SEARCH', 'CONTACT_CLICK')
            AND "createdAt" >= ${from} AND "createdAt" < ${to}
        `,
      env.analytics.queryTimeoutMs
    );
    return {
      searchSessions: Number(rows[0]?.searchSessions ?? 0),
      contactSessions: Number(rows[0]?.contactSessions ?? 0),
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
    // Keep both funnel counts in one timeout-bounded query, reducing pool
    // checkout/transaction overhead while preserving distinct-session semantics.
    const rows = await runWithQueryTimeout(
      tx =>
        tx.$queryRaw<{ startedSessions: bigint; completedSessions: bigint }[]>`
          SELECT
            COUNT(DISTINCT "sessionId") FILTER (WHERE "event" = 'SIGNUP_STARTED') AS "startedSessions",
            COUNT(DISTINCT "sessionId") FILTER (WHERE "event" = 'SIGNUP_COMPLETED') AS "completedSessions"
          FROM "analytics_events"
          WHERE "event" IN ('SIGNUP_STARTED', 'SIGNUP_COMPLETED')
            AND "createdAt" >= ${from} AND "createdAt" < ${to}
        `,
      env.analytics.queryTimeoutMs
    );
    return {
      startedSessions: Number(rows[0]?.startedSessions ?? 0),
      completedSessions: Number(rows[0]?.completedSessions ?? 0),
    };
  },
};
