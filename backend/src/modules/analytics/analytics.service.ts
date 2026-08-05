import { analyticsRepository } from './analytics.repository';
import { TrackEventsInput, GetAnalyticsSummaryQuery } from './analytics.validation';
import { verifyAccessToken } from '../../shared/utils/jwt';
import { logger } from '../../shared/utils/logger';
import { prisma } from '../../config/prisma';
import { AnalyticsEventType } from '@prisma/client';

const DEFAULT_RANGE_DAYS = 30;

// This endpoint is intentionally reachable without a valid session (see
// analytics.routes.ts — anonymous visitors are most of a marketplace's
// traffic, and a product-analytics endpoint that only saw logged-in
// users would miss the majority of browsing/search behavior). But a
// logged-in visitor's events should still carry their userId when
// available, so the funnel can eventually be sliced by
// registered-vs-anonymous.
//
// Deliberately swallows any verification failure (expired/missing/
// malformed token) rather than rejecting the request — an analytics
// beacon should never fail because of an auth edge case; worst case it
// records the event as anonymous.
const resolveOptionalUserId = (authHeader: string | undefined): string | null => {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split(' ')[1];
    return verifyAccessToken(token).userId;
  } catch {
    return null;
  }
};

export const analyticsService = {
  trackEvents: async (input: TrackEventsInput, authHeader: string | undefined): Promise<void> => {
    const userId = resolveOptionalUserId(authHeader);
    try {
      await analyticsRepository.createMany(input.events, userId);
    } catch (err) {
      // Same fire-and-forget posture as shared/utils/auditLog.ts: a
      // write failure here must never surface as a user-facing error —
      // losing a batch of analytics events is acceptable, breaking the
      // page that sent them is not.
      logger.error('Failed to write analytics events', { err });
    }
  },

  getSummary: async (query: GetAnalyticsSummaryQuery) => {
    const to = query.to ?? new Date();
    const from = query.from ?? new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
    const bucket = query.bucket ?? 'day';

    const [eventCounts, trend, topCategories, searchToContact, signupFunnel] = await Promise.all([
      analyticsRepository.countByEvent(from, to),
      analyticsRepository.trendByEvent(from, to, bucket),
      analyticsRepository.topCategories(from, to),
      analyticsRepository.searchToContactSessions(from, to),
      analyticsRepository.signupFunnelSessions(from, to),
    ]);

    // Enrich topCategories with display names — the repository only
    // has categoryId (pulled from event metadata, no join available at
    // the raw-SQL level against a JSON field). A single follow-up
    // lookup here keeps the admin dashboard from showing raw cuid
    // strings instead of "أثاث"/"سيارات"/etc.
    const categoryRows = await prisma.category.findMany({
      where: { id: { in: topCategories.map(c => c.categoryId) } },
      select: { id: true, name: true, nameAr: true },
    });
    const categoryById = new Map(categoryRows.map(c => [c.id, c]));
    const topCategoriesEnriched = topCategories.map(c => ({
      categoryId: c.categoryId,
      count: c.count,
      name: categoryById.get(c.categoryId)?.name ?? null,
      nameAr: categoryById.get(c.categoryId)?.nameAr ?? null,
    }));

    const totals = Object.fromEntries(
      Object.values(AnalyticsEventType).map(e => [e, 0])
    ) as Record<AnalyticsEventType, number>;
    for (const { event, count } of eventCounts) totals[event] = count;

    return {
      range: { from, to, bucket },
      totals,
      trend,
      topCategories: topCategoriesEnriched,
      searchToContact: {
        searchSessions: searchToContact.searchSessions,
        contactSessions: searchToContact.contactSessions,
        // Guard divide-by-zero for an empty/quiet range rather than
        // returning NaN to the frontend.
        conversionRate:
          searchToContact.searchSessions === 0
            ? 0
            : searchToContact.contactSessions / searchToContact.searchSessions,
      },
      signupFunnel: {
        startedSessions: signupFunnel.startedSessions,
        completedSessions: signupFunnel.completedSessions,
        conversionRate:
          signupFunnel.startedSessions === 0
            ? 0
            : signupFunnel.completedSessions / signupFunnel.startedSessions,
      },
    };
  },
};
