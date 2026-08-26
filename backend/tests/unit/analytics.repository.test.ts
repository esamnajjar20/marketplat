import { analyticsRepository } from '../../src/modules/analytics/analytics.repository';
import { prisma } from '../../src/config/prisma';
import { runWithQueryTimeout } from '../../src/shared/utils/queryTimeout';
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

jest.mock('../../src/shared/utils/queryTimeout', () => ({
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
    });
  });

  it('countByEvent maps groupBy rows', async () => {
    (prisma.analyticsEvent.groupBy as jest.Mock).mockResolvedValue([
      { event: AnalyticsEventType.SEARCH, _count: { _all: 5 } },
    ]);
    const rows = await analyticsRepository.countByEvent(from, to);
    expect(rows).toEqual([{ event: AnalyticsEventType.SEARCH, count: 5 }]);
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
    (prisma.analyticsEvent.findMany as jest.Mock)
      .mockResolvedValueOnce([{ sessionId: 'a' }, { sessionId: 'b' }])
      .mockResolvedValueOnce([{ sessionId: 'a' }]);
    const result = await analyticsRepository.searchToContactSessions(from, to);
    expect(result).toEqual({ searchSessions: 2, contactSessions: 1 });
  });

  it('signupFunnelSessions counts started vs completed', async () => {
    (prisma.analyticsEvent.findMany as jest.Mock)
      .mockResolvedValueOnce([{ sessionId: 'x' }, { sessionId: 'y' }])
      .mockResolvedValueOnce([{ sessionId: 'x' }]);
    const result = await analyticsRepository.signupFunnelSessions(from, to);
    expect(result).toEqual({ startedSessions: 2, completedSessions: 1 });
  });
});
