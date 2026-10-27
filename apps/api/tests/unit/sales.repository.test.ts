import { salesRepository } from '../../src/modules/sales/sales.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({ prisma: { $queryRaw: jest.fn() } }));

describe('salesRepository.topCustomers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ranks customers by net revenue after refunds and preserves the dashboard result shape', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      { customerId: 'customer-1', buyerName: 'A', totalSpent: 65, saleCount: 3n },
      { customerId: 'customer-2', buyerName: 'B', totalSpent: 40, saleCount: 1n },
    ]);

    await expect(salesRepository.topCustomers('seller-1', 5)).resolves.toEqual([
      { customerId: 'customer-1', buyerName: 'A', _sum: { totalPrice: 65 }, _count: { id: 3 } },
      { customerId: 'customer-2', buyerName: 'B', _sum: { totalPrice: 40 }, _count: { id: 1 } },
    ]);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('bounds invalid and excessive limits before passing them to SQL', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);
    await salesRepository.topCustomers('seller-1', Number.POSITIVE_INFINITY);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
