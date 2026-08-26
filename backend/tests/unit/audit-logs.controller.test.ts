import { auditLogsController } from '../../src/modules/audit-logs/audit-logs.controller';
import { auditLogsService } from '../../src/modules/audit-logs/audit-logs.service';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/audit-logs/audit-logs.service');

describe('auditLogsController', () => {
  beforeEach(() => jest.clearAllMocks());

  it('getAuditLogs returns 200 with pagination meta', async () => {
    (auditLogsService.getAuditLogs as jest.Mock).mockResolvedValue({
      items: [],
      meta: { total: 0 },
    });
    const res = mockResponse();
    await auditLogsController.getAuditLogs(mockRequest({ query: {} }), res, mockNext());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards errors to next', async () => {
    (auditLogsService.getAuditLogs as jest.Mock).mockRejectedValue(new Error('x'));
    const next = mockNext();
    await auditLogsController.getAuditLogs(mockRequest({ query: {} }), mockResponse(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
