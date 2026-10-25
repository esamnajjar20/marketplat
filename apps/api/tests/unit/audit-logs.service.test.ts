import { auditLogsService } from '../../src/modules/audit-logs/audit-logs.service';
import { auditLogsRepository } from '../../src/modules/audit-logs/audit-logs.repository';

jest.mock('../../src/modules/audit-logs/audit-logs.repository');

const mockLog = {
  id: 'log-1',
  event: 'ADMIN_USER_STATUS_CHANGED',
  userId: 'admin-1',
  sessionId: null,
  ip: '127.0.0.1',
  userAgent: 'jest',
  details: { targetUserId: 'user-1' },
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  user: { id: 'admin-1', name: 'Admin', email: 'admin@example.com' },
};

describe('AuditLogsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getAuditLogs', () => {
    it('returns paginated audit logs with meta', async () => {
      (auditLogsRepository.findMany as jest.Mock).mockResolvedValue({
        logs: [mockLog],
        total: 1,
      });

      const result = await auditLogsService.getAuditLogs({ page: 1, limit: 20 });

      expect(auditLogsRepository.findMany).toHaveBeenCalledWith({ page: 1, limit: 20 });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('log-1');
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
    });

    it('defaults page/limit for meta when omitted from the query', async () => {
      (auditLogsRepository.findMany as jest.Mock).mockResolvedValue({ logs: [], total: 0 });

      const result = await auditLogsService.getAuditLogs({});

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.items).toHaveLength(0);
    });

    it('passes filters through untouched to the repository', async () => {
      (auditLogsRepository.findMany as jest.Mock).mockResolvedValue({ logs: [], total: 0 });
      const query = {
        page: 2,
        limit: 10,
        event: 'LOGIN_FAILED' as const,
        userId: 'user-1',
        from: new Date('2026-01-01T00:00:00.000Z'),
        to: new Date('2026-02-01T00:00:00.000Z'),
        sortBy: 'event' as const,
        sortOrder: 'asc' as const,
      };

      await auditLogsService.getAuditLogs(query);

      expect(auditLogsRepository.findMany).toHaveBeenCalledWith(query);
    });
  });
});
