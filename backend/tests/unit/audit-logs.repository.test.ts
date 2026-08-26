import { auditLogsRepository } from '../../src/modules/audit-logs/audit-logs.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

describe('auditLogsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('findMany applies filters and returns logs + total', async () => {
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([{ id: 'log-1' }]);
    (prisma.auditLog.count as jest.Mock).mockResolvedValue(1);

    const result = await auditLogsRepository.findMany({
      page: 1,
      limit: 20,
      event: 'USER_BAN',
      userId: 'admin-1',
    } as any);

    expect(result).toEqual({ logs: [{ id: 'log-1' }], total: 1 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ event: 'USER_BAN', userId: 'admin-1' }),
      }),
    );
  });

  it('findMany supports date range filters', async () => {
    (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.auditLog.count as jest.Mock).mockResolvedValue(0);
    const from = new Date('2026-01-01');
    const to = new Date('2026-02-01');
    await auditLogsRepository.findMany({ page: 1, limit: 10, from, to } as any);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: expect.objectContaining({ gte: from, lte: to }),
        }),
      }),
    );
  });
});
