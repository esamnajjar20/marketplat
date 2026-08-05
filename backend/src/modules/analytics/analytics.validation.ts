import { z } from 'zod';
import { AnalyticsEventType } from '@prisma/client';

// POST /analytics/events — accepts a small batch per request rather than
// one event per HTTP call. The frontend fires this on page unload / route
// change, where several events (e.g. PAGE_VIEW + CATEGORY_BROWSE) can
// legitimately queue up together; batching keeps this to one round-trip
// instead of one per event.
const analyticsEventSchema = z.object({
  event: z.nativeEnum(AnalyticsEventType),
  // Client-generated (crypto.randomUUID()) — see schema.prisma's
  // AnalyticsEvent.sessionId comment. Required: without it, anonymous
  // traffic can't be strung into a funnel at all.
  sessionId: z.string().trim().min(1).max(100),
  // Bounded — this is an unauthenticated-friendly endpoint (see
  // analytics.routes.ts), so payload size is a real DoS surface, not
  // just data hygiene. 10KB is generous for the small key/value shapes
  // documented on the Prisma model (adId, query text, categoryId, step
  // name) and rejects anything trying to smuggle a large blob through.
  metadata: z.record(z.unknown()).optional().refine(
    val => !val || JSON.stringify(val).length <= 10_000,
    { message: 'metadata too large' }
  ),
  path: z.string().trim().max(500).optional(),
  referrer: z.string().trim().max(500).optional(),
});

export const trackEventsSchema = z.object({
  body: z.object({
    events: z.array(analyticsEventSchema).min(1).max(20),
  }),
});

export type TrackEventInput = z.infer<typeof analyticsEventSchema>;
export type TrackEventsInput = z.infer<typeof trackEventsSchema>['body'];

// GET /admin/analytics/summary
export const getAnalyticsSummarySchema = z.object({
  query: z
    .object({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
      // Time-series bucket size for the trend chart. Kept to two options
      // — day for the default 30-day view, week for longer ranges where
      // per-day points would be too noisy/dense to read.
      bucket: z.enum(['day', 'week']).optional(),
    })
    .refine(data => !data.from || !data.to || data.from <= data.to, {
      message: '"from" must be before or equal to "to"',
      path: ['from'],
    }),
});

export type GetAnalyticsSummaryQuery = z.infer<typeof getAnalyticsSummarySchema>['query'];
