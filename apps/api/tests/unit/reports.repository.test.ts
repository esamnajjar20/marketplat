import { reportsRepository } from '../../src/modules/reports/reports.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    report: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

describe('reportsRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('create stores AD reports with adId set', async () => {
    (prisma.report.create as jest.Mock).mockResolvedValue({ id: 'r1' });
    await reportsRepository.create('user-1', 'AD' as any, 'ad-1', 'SPAM' as any, 'note');
    expect(prisma.report.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        targetType: 'AD',
        targetId: 'ad-1',
        adId: 'ad-1',
        reason: 'SPAM',
      }),
    });
  });

  it('findByUserAndTarget looks up unique compound key', async () => {
    (prisma.report.findUnique as jest.Mock).mockResolvedValue(null);
    await reportsRepository.findByUserAndTarget('user-1', 'AD' as any, 'ad-1');
    expect(prisma.report.findUnique).toHaveBeenCalledWith({
      where: {
        targetType_targetId_userId: {
          targetType: 'AD',
          targetId: 'ad-1',
          userId: 'user-1',
        },
      },
    });
  });

  it('findMany applies filters and pagination', async () => {
    (prisma.report.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.report.count as jest.Mock).mockResolvedValue(0);
    const result = await reportsRepository.findMany({ page: 1, limit: 20 } as any);
    expect(result).toBeDefined();
    expect(prisma.report.findMany).toHaveBeenCalled();
  });
});
