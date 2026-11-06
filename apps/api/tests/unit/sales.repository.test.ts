import { salesRepository } from '../../src/modules/sales/sales.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    saleRecord: { aggregate: jest.fn() },
    saleItem: { findMany: jest.fn() },
  },
}));

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

describe('salesRepository.summary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('aggregates historical item cost in PostgreSQL instead of loading every sale item', async () => {
    const from = new Date('2026-10-01T00:00:00.000Z');
    const to = new Date('2026-11-01T00:00:00.000Z');
    (prisma.saleRecord.aggregate as jest.Mock).mockResolvedValue({
      _count: { _all: 4 },
      _sum: {
        totalPrice: 100,
        refundedAmount: 5,
        paidAmount: 50,
        dueAmount: 45,
        quantity: 10,
      },
    });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ totalCost: 12.345 }]);

    await expect(salesRepository.summary('seller-1', from, to)).resolves.toEqual({
      salesCount: 4,
      quantity: 10,
      totalRevenue: 95,
      totalCost: 12.35,
      netProfit: 82.65,
      totalPaid: 50,
      totalRefunded: 5,
      totalDue: 45,
    });

    expect(prisma.saleRecord.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: { sellerId: 'seller-1', soldAt: { gte: from, lt: to } },
    }));
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [queryTemplate, ...values] = (prisma.$queryRaw as jest.Mock).mock.calls[0];
    expect(queryTemplate.join('')).toContain('FROM "sale_items" si');
    expect(queryTemplate.join('')).toContain('GREATEST(si."quantity" - si."returnedQuantity", 0)');
    expect(values).toEqual(['seller-1', from, to]);
    expect(prisma.saleItem.findMany).not.toHaveBeenCalled();
  });

  it('treats absent item-cost aggregate rows as zero without failing the summary', async () => {
    (prisma.saleRecord.aggregate as jest.Mock).mockResolvedValue({
      _count: { _all: 0 },
      _sum: { totalPrice: null, refundedAmount: null, paidAmount: null, dueAmount: null, quantity: null },
    });
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([]);

    await expect(
      salesRepository.summary('seller-1', new Date('2026-10-01'), new Date('2026-11-01'))
    ).resolves.toMatchObject({ salesCount: 0, totalCost: 0, netProfit: 0 });
  });
});
