import { fraudRepository } from '../../src/modules/fraud/fraud.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    ad: {
      count: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    fraudSignal: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
  },
}));

describe('fraudRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  it('countRecentAdsByUser counts ads in the window', async () => {
    (prisma.ad.count as jest.Mock).mockResolvedValue(3);
    const n = await fraudRepository.countRecentAdsByUser('u1', 3600);
    expect(n).toBe(3);
    expect(prisma.ad.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'u1',
        createdAt: expect.objectContaining({ gte: expect.any(Date) }),
      }),
    });
  });

  it('getCategoryMedianPrice returns null when sample is thin', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { median: 100, sample_size: 2n },
    ]);
    const median = await fraudRepository.getCategoryMedianPrice('cat-1');
    expect(median).toBeNull();
  });

  it('getCategoryMedianPrice returns median when sample is large enough', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { median: 250, sample_size: 10n },
    ]);
    const median = await fraudRepository.getCategoryMedianPrice('cat-1', 'ad-x');
    expect(median).toBe(250);
  });

  it('findPotentialDuplicates queries by title and city', async () => {
    (prisma.ad.findMany as jest.Mock).mockResolvedValue([{ id: 'a1' }]);
    const rows = await fraudRepository.findPotentialDuplicates('u1', 'Title', 'غزة');
    expect(rows).toEqual([{ id: 'a1' }]);
  });

  it('setAdRiskScore updates via transaction client', async () => {
    const tx = { ad: { update: jest.fn().mockResolvedValue({}) } };
    await fraudRepository.setAdRiskScore(tx as any, 'ad-1', 80, true);
    expect(tx.ad.update).toHaveBeenCalledWith({
      where: { id: 'ad-1' },
      data: expect.objectContaining({ riskScore: 80, flaggedForReview: true }),
    });
  });
});
