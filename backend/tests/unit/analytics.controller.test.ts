import { analyticsController } from '../../src/modules/analytics/analytics.controller';
import { analyticsService } from '../../src/modules/analytics/analytics.service';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';
import { AnalyticsEventType } from '@prisma/client';

jest.mock('../../src/modules/analytics/analytics.service');

describe('analyticsController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('trackEvents', () => {
    it('returns 202 when events are accepted', async () => {
      (analyticsService.trackEvents as jest.Mock).mockResolvedValue(undefined);
      const res = mockResponse();
      await analyticsController.trackEvents(
        mockRequest({
          body: {
            events: [
              {
                event: AnalyticsEventType.PAGE_VIEW,
                sessionId: 'sess-1',
                path: '/',
              },
            ],
          },
          headers: { authorization: 'Bearer x' },
        }),
        res,
        mockNext(),
      );
      expect(analyticsService.trackEvents).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(202);
    });

    it('forwards validation/service errors to next', async () => {
      const next = mockNext();
      await analyticsController.trackEvents(
        mockRequest({ body: { events: [] } }),
        mockResponse(),
        next,
      );
      expect(next).toHaveBeenCalled();
    });
  });

  describe('getSummary', () => {
    it('returns 200 with summary payload', async () => {
      const summary = { totals: { PAGE_VIEW: 10 } };
      (analyticsService.getSummary as jest.Mock).mockResolvedValue(summary);
      const res = mockResponse();
      await analyticsController.getSummary(mockRequest({ query: {} }), res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: summary }),
      );
    });

    it('forwards errors to next', async () => {
      (analyticsService.getSummary as jest.Mock).mockRejectedValue(new Error('timeout'));
      const next = mockNext();
      await analyticsController.getSummary(mockRequest({ query: {} }), mockResponse(), next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
