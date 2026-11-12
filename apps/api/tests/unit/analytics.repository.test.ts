import { analyticsRepository } from '../../src/modules/platform/analytics/analytics.repository';
import { prisma } from '../../src/config/prisma';
import { runWithQueryTimeout } from '../../src/shared/db/queryTimeout';
import { AnalyticsEventType } from '@prisma/client';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    analyticsEvent: {
      createMany: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../../src/shared/db/queryTimeout', () => ({
  runWithQueryTimeout: jest.fn(),
}));

describe('analyticsRepository', () => {
  const from = new Date('2026-01-01');
  const to = new Date('2026-02-01');

  beforeEach(() => jest.clearAllMocks());

  it('createMany maps events with optional metadata', async () => {
    (prisma.analyticsEvent.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    await analyticsRepository.createMany(
      [
        {
          event: AnalyticsEventType.PAGE_VIEW,
          sessionId: 's1',
          path: '/',
          metadata: { a: 1 },
        } as any,
      ],
      'user-1',
    );
    expect(prisma.analyticsEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          event: AnalyticsEventType.PAGE_VIEW,
          sessionId: 's1',
          userId: 'user-1',
          path: '/',
        }),
      ],
      skipDuplicates: true,
    });
  });


  it('uses the stable event ID as the database primary key for idempotent fallback writes', async () => {
    (prisma.analyticsEvent.createMany as jest.Mock).mockResolvedValue({ count: 1 });
    await analyticsRepository.createMany(
      [{ eventId: 'event-uuid-1', event: AnalyticsEventType.PAGE_VIEW, sessionId: 's1' } as any],
      null,
    );
    expect(prisma.analyticsEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ id: 'event-uuid-1', event: AnalyticsEventType.PAGE_VIEW })],
      skipDuplicates: true,
    });
  });

  it('countByEvent uses the bounded summary query and maps bigint counts', async () => {
    (runWithQueryTimeout as jest.Mock).mockResolvedValue([
      { event: AnalyticsEventType.SEARCH, count: 5n },
    ]);
    const rows = await analyticsRepository.countByEvent(from, to);
    expect(runWithQueryTimeout).toHaveBeenCalled();
    expect(rows).toEqual([{ event: AnalyticsEventType.SEARCH, count: 5 }]);
  });

  it('uses daily rollups for full UTC days while retaining raw-event fallback for uncovered dates', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ ready: true }])
      .mockResolvedValueOnce([{ event: AnalyticsEventType.SEARCH, count: 15n }]);
    (runWithQueryTimeout as jest.Mock).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ $queryRaw: query } as any),
    );

    const rows = await analyticsRepository.countByEvent(from, to);

    expect(rows).toEqual([{ event: AnalyticsEventType.SEARCH, count: 15 }]);
    expect(query).toHaveBeenCalledTimes(2);
    const aggregateSql = query.mock.calls[1][0].join('');
    expect(aggregateSql).toContain('analytics_event_daily_rollups');
    expect(aggregateSql).toContain('analytics_rollup_days');
    expect(aggregateSql).toContain('NOT EXISTS');
  });

  it('uses raw events when the requested range contains no full UTC day', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { event: AnalyticsEventType.SEARCH, count: 2n },
    ]);
    (runWithQueryTimeout as jest.Mock).mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ $queryRaw: query } as any),
    );

    const rows = await analyticsRepository.countByEvent(
      new Date('2026-01-01T12:00:00.000Z'),
      new Date('2026-01-01T20:00:00.000Z'),
    );

    expect(rows).toEqual([{ event: AnalyticsEventType.SEARCH, count: 2 }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].join('')).toContain('FROM "analytics_events"');
    expect(query.mock.calls[0][0].join('')).not.toContain('analytics_event_daily_rollups');
  });

  it('trendByEvent uses runWithQueryTimeout and maps bigint counts', async () => {
    (runWithQueryTimeout as jest.Mock).mockResolvedValue([
      { bucket: from, event: AnalyticsEventType.PAGE_VIEW, count: 3n },
    ]);
    const rows = await analyticsRepository.trendByEvent(from, to, 'day');
    expect(runWithQueryTimeout).toHaveBeenCalled();
    expect(rows[0]).toEqual({
      bucket: from,
      event: AnalyticsEventType.PAGE_VIEW,
      count: 3,
    });
  });

  it('topCategories maps category browse counts', async () => {
    (runWithQueryTimeout as jest.Mock).mockResolvedValue([
      { categoryId: 'cat-1', count: 9n },
    ]);
    const rows = await analyticsRepository.topCategories(from, to, 10);
    expect(rows).toEqual([{ categoryId: 'cat-1', count: 9 }]);
  });

  it('searchToContactSessions counts distinct sessions', async () => {
    (runWithQueryTimeout as jest.Mock).mockResolvedValue([
      { searchSessions: 2n, contactSessions: 1n },
    ]);
    const result = await analyticsRepository.searchToContactSessions(from, to);
    expect(result).toEqual({ searchSessions: 2, contactSessions: 1 });
  });

  it('signupFunnelSessions counts started vs completed', async () => {
    (runWithQueryTimeout as jest.Mock).mockResolvedValue([
      { startedSessions: 2n, completedSessions: 1n },
    ]);
    const result = await analyticsRepository.signupFunnelSessions(from, to);
    expect(result).toEqual({ startedSessions: 2, completedSessions: 1 });
  });
});
