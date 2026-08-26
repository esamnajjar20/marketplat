/**
 * analytics.service unit coverage (Phase 3 / P2) — previously 0 unit tests.
 */
import { analyticsService } from '../../src/modules/analytics/analytics.service';
import { analyticsRepository } from '../../src/modules/analytics/analytics.repository';
import { prisma } from '../../src/config/prisma';
import * as jwtUtils from '../../src/shared/utils/jwt';
import { logger } from '../../src/shared/utils/logger';
import jwt from 'jsonwebtoken';
import { AnalyticsEventType } from '@prisma/client';

jest.mock('../../src/modules/analytics/analytics.repository');
jest.mock('../../src/config/prisma', () => ({
  prisma: {
    category: { findMany: jest.fn() },
  },
}));
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/shared/utils/jwt');

describe('analyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (analyticsRepository.createMany as jest.Mock).mockResolvedValue(undefined);
  });

  describe('trackEvents', () => {
    it('records events anonymously when no Authorization header is present', async () => {
      await analyticsService.trackEvents(
        { events: [{ event: 'SEARCH' as AnalyticsEventType, sessionId: 'sess-1', metadata: {} }] },
        undefined,
      );

      expect(analyticsRepository.createMany).toHaveBeenCalledWith(
        expect.any(Array),
        null,
      );
      expect(jwtUtils.verifyAccessToken).not.toHaveBeenCalled();
    });

    it('records events anonymously when the header is not Bearer', async () => {
      await analyticsService.trackEvents(
        { events: [{ event: 'AD_VIEW' as AnalyticsEventType, sessionId: 'sess-1' }] },
        'Basic xyz',
      );
      expect(analyticsRepository.createMany).toHaveBeenCalledWith(expect.any(Array), null);
    });

    it('attaches userId when the access token is valid', async () => {
      (jwtUtils.verifyAccessToken as jest.Mock).mockReturnValue({ userId: 'user-1' });

      await analyticsService.trackEvents(
        { events: [{ event: 'SEARCH' as AnalyticsEventType, sessionId: 'sess-1' }] },
        'Bearer valid-token',
      );

      expect(jwtUtils.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(analyticsRepository.createMany).toHaveBeenCalledWith(expect.any(Array), 'user-1');
    });

    it('logs debug and records anonymously on TokenExpiredError', async () => {
      const err = new jwt.TokenExpiredError('jwt expired', new Date());
      (jwtUtils.verifyAccessToken as jest.Mock).mockImplementation(() => {
        throw err;
      });

      await analyticsService.trackEvents(
        { events: [{ event: 'SEARCH' as AnalyticsEventType, sessionId: 'sess-1' }] },
        'Bearer expired',
      );

      expect(logger.debug).toHaveBeenCalled();
      expect(analyticsRepository.createMany).toHaveBeenCalledWith(expect.any(Array), null);
    });

    it('logs warn and records anonymously on other JWT errors', async () => {
      (jwtUtils.verifyAccessToken as jest.Mock).mockImplementation(() => {
        throw new jwt.JsonWebTokenError('invalid signature');
      });

      await analyticsService.trackEvents(
        { events: [{ event: 'SEARCH' as AnalyticsEventType, sessionId: 'sess-1' }] },
        'Bearer bad',
      );

      expect(logger.warn).toHaveBeenCalled();
      expect(analyticsRepository.createMany).toHaveBeenCalledWith(expect.any(Array), null);
    });

    it('swallows repository write failures (fire-and-forget)', async () => {
      (analyticsRepository.createMany as jest.Mock).mockRejectedValue(new Error('db down'));

      await expect(
        analyticsService.trackEvents(
          { events: [{ event: 'SEARCH' as AnalyticsEventType, sessionId: 'sess-1' }] },
          undefined,
        ),
      ).resolves.toBeUndefined();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to write analytics events',
        expect.objectContaining({ err: expect.any(Error) }),
      );
    });
  });

  describe('getSummary', () => {
    beforeEach(() => {
      (analyticsRepository.countByEvent as jest.Mock).mockResolvedValue([
        { event: 'SEARCH', count: 10 },
        { event: 'AD_VIEW', count: 5 },
      ]);
      (analyticsRepository.trendByEvent as jest.Mock).mockResolvedValue([]);
      (analyticsRepository.topCategories as jest.Mock).mockResolvedValue([
        { categoryId: 'cat-1', count: 3 },
      ]);
      (analyticsRepository.searchToContactSessions as jest.Mock).mockResolvedValue({
        searchSessions: 20,
        contactSessions: 4,
      });
      (analyticsRepository.signupFunnelSessions as jest.Mock).mockResolvedValue({
        startedSessions: 10,
        completedSessions: 2,
      });
      (prisma.category.findMany as jest.Mock).mockResolvedValue([
        { id: 'cat-1', name: 'Furniture', nameAr: 'أثاث' },
      ]);
    });

    it('defaults range to last 30 days and bucket to day', async () => {
      const summary = await analyticsService.getSummary({});

      expect(summary.range.bucket).toBe('day');
      expect(summary.range.from.getTime()).toBeLessThan(summary.range.to.getTime());
      const spanDays =
        (summary.range.to.getTime() - summary.range.from.getTime()) / (24 * 60 * 60 * 1000);
      expect(spanDays).toBeGreaterThan(29);
      expect(spanDays).toBeLessThan(31);
    });

    it('enriches topCategories with name / nameAr', async () => {
      const summary = await analyticsService.getSummary({});

      expect(summary.topCategories).toEqual([
        { categoryId: 'cat-1', count: 3, name: 'Furniture', nameAr: 'أثاث' },
      ]);
    });

    it('computes searchToContact conversionRate and guards divide-by-zero', async () => {
      const summary = await analyticsService.getSummary({});
      expect(summary.searchToContact.conversionRate).toBe(0.2);

      (analyticsRepository.searchToContactSessions as jest.Mock).mockResolvedValue({
        searchSessions: 0,
        contactSessions: 0,
      });
      const empty = await analyticsService.getSummary({});
      expect(empty.searchToContact.conversionRate).toBe(0);
    });

    it('computes signupFunnel conversionRate', async () => {
      const summary = await analyticsService.getSummary({});
      expect(summary.signupFunnel.conversionRate).toBe(0.2);
    });

    it('fills totals for every AnalyticsEventType (missing → 0)', async () => {
      const summary = await analyticsService.getSummary({});
      for (const event of Object.values(AnalyticsEventType)) {
        expect(summary.totals[event]).toBeGreaterThanOrEqual(0);
      }
      expect(summary.totals.SEARCH).toBe(10);
      expect(summary.totals.AD_VIEW).toBe(5);
    });

    it('respects explicit from/to/bucket query', async () => {
      const from = new Date('2024-01-01');
      const to = new Date('2024-01-31');
      await analyticsService.getSummary({ from, to, bucket: 'week' } as any);

      expect(analyticsRepository.trendByEvent).toHaveBeenCalledWith(from, to, 'week');
      expect(analyticsRepository.countByEvent).toHaveBeenCalledWith(from, to);
    });
  });
});
