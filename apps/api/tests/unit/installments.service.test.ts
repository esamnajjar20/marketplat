import { installmentsService } from '../../src/modules/sales/installments.service';
import { prisma } from '../../src/config/prisma';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    saleInstallment: { findUnique: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const tx = {
  $queryRaw: jest.fn(),
  saleRecord: { findUnique: jest.fn(), update: jest.fn(), aggregate: jest.fn() },
  saleInstallment: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  salePayment: { create: jest.fn() },
  customer: { update: jest.fn() },
};

const sale = {
  id: 'sale-1', sellerId: 'seller-1', totalPrice: 100, refundedAmount: 20,
  paidAmount: 30, dueAmount: 50, dueDate: null, customerId: null,
};
const installment = {
  id: 'installment-1', saleId: 'sale-1', installmentNo: 1,
  amount: 50, paidAmount: 10, status: 'PARTIAL',
};

describe('installmentsService.pay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (transactionClient: any) => unknown) => callback(tx));
    (prisma.saleInstallment.findUnique as jest.Mock).mockResolvedValue({ id: installment.id, saleId: sale.id });
    tx.$queryRaw.mockResolvedValue([{ id: sale.id }]);
    tx.saleRecord.findUnique.mockResolvedValue(sale);
    tx.saleInstallment.findUnique.mockResolvedValue(installment);
    tx.saleInstallment.update.mockImplementation(async ({ data }) => ({ ...installment, ...data }));
    tx.saleRecord.update.mockResolvedValue({ ...sale, paidAmount: 50, dueAmount: 30, paymentStatus: 'PARTIAL' });
    tx.salePayment.create.mockResolvedValue({ id: 'payment-1' });
  });

  it('locks the sale and computes the remaining balance after refunds', async () => {
    await installmentsService.pay('seller-1', 'installment-1', 20);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.saleInstallment.update).toHaveBeenCalledWith({
      where: { id: 'installment-1' },
      data: { paidAmount: 30, paidAt: undefined, status: 'PARTIAL' },
    });
    expect(tx.saleRecord.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: { paidAmount: 50, dueAmount: 30, paymentStatus: 'PARTIAL' },
    });
    expect(tx.salePayment.create).toHaveBeenCalledWith({
      data: { saleId: 'sale-1', amount: 20, method: 'OTHER', note: 'INSTALLMENT:1' },
    });
  });

  it('closes remaining installments once the net sale balance is fully paid', async () => {
    tx.saleRecord.findUnique.mockResolvedValue({ ...sale, totalPrice: 100, refundedAmount: 20, paidAmount: 60 });
    tx.saleInstallment.findUnique.mockResolvedValue({ ...installment, amount: 50, paidAmount: 30 });

    const result = await installmentsService.pay('seller-1', 'installment-1', 20);

    expect(tx.saleInstallment.updateMany).toHaveBeenCalledWith({
      where: { saleId: 'sale-1', status: { not: 'PAID' } },
      data: { status: 'PAID', paidAt: expect.any(Date) },
    });
    expect(result.status).toBe('PAID');
  });

  it('does not close other installments while a balance remains', async () => {
    await installmentsService.pay('seller-1', 'installment-1', 20);
    expect(tx.saleInstallment.updateMany).not.toHaveBeenCalled();
  });

  it('rejects payment that fits the installment but exceeds the net sale balance', async () => {
    tx.saleRecord.findUnique.mockResolvedValue({ ...sale, totalPrice: 100, refundedAmount: 50, paidAmount: 40 });
    tx.saleInstallment.findUnique.mockResolvedValue({ ...installment, amount: 40, paidAmount: 0 });

    await expect(installmentsService.pay('seller-1', 'installment-1', 20)).rejects.toBeInstanceOf(BadRequestError);
    expect(tx.saleInstallment.update).not.toHaveBeenCalled();
    expect(tx.salePayment.create).not.toHaveBeenCalled();
  });

  it('locks the customer before recomputing aggregates after an installment payment', async () => {
    const soldAt = new Date('2026-02-01T00:00:00.000Z');
    tx.saleRecord.findUnique.mockResolvedValue({ ...sale, customerId: 'customer-1' });
    tx.saleRecord.aggregate.mockResolvedValue({
      _sum: { totalPrice: 100, refundedAmount: 20, dueAmount: 30 },
      _count: { _all: 1 },
      _min: { soldAt },
      _max: { soldAt },
    });

    await installmentsService.pay('seller-1', 'installment-1', 20);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.saleRecord.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: { sellerId: 'seller-1', customerId: 'customer-1' },
    }));
    expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-1' },
      data: expect.objectContaining({ totalSpent: 80, totalDue: 30, lastPurchaseAt: soldAt }),
    }));
  });

  it('re-reads the installment after acquiring the sale lock', async () => {
    // The service reads the lightweight reference before the transaction
    // via prisma.saleInstallment.findUnique, then performs one fresh read
    // after acquiring the sale lock via tx.saleInstallment.findUnique.
    tx.saleInstallment.findUnique.mockResolvedValueOnce({ ...installment, paidAmount: 50 });

    await expect(installmentsService.pay('seller-1', 'installment-1', 1)).rejects.toBeInstanceOf(BadRequestError);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.saleInstallment.update).not.toHaveBeenCalled();
  });
});
