import { prisma } from '../../config/prisma';
import { InstallmentStatus, Prisma } from '@prisma/client';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';

const refreshStatus = (
  status: InstallmentStatus,
  dueDate: Date,
  paidAmount: number,
  amount: number
): InstallmentStatus => {
  if (paidAmount >= amount) return 'PAID';
  if (paidAmount > 0) return 'PARTIAL';
  if (dueDate < new Date()) return 'OVERDUE';
  return status === 'OVERDUE' ? 'OVERDUE' : 'PENDING';
};

export const installmentsService = {
  upcoming: async (sellerId: string) => {
    const rows = await prisma.saleInstallment.findMany({
      where: {
        sale: { sellerId },
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { gte: new Date() },
      },
      include: { sale: { include: { customer: true } } },
      orderBy: { dueDate: 'asc' },
      take: 200,
    });
    return rows.map(r => ({
      ...r,
      status: refreshStatus(r.status, r.dueDate, Number(r.paidAmount ?? 0), Number(r.amount)),
    }));
  },
  overdue: async (sellerId: string) => {
    const rows = await prisma.saleInstallment.findMany({
      where: {
        sale: { sellerId },
        dueDate: { lt: new Date() },
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      },
      include: { sale: { include: { customer: true } } },
      orderBy: { dueDate: 'asc' },
      take: 200,
    });
    return rows.map(r => ({
      ...r,
      status: refreshStatus(r.status, r.dueDate, Number(r.paidAmount ?? 0), Number(r.amount)),
    }));
  },
  pay: async (sellerId: string, id: string, amount: number) => {
    const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestError(
        'Installment payment must be positive.',
        'INVALID_INSTALLMENT_PAYMENT'
      );
    }

    // Resolve only the parent ID outside the transaction. Every value used for
    // validation is re-read after taking the sale row lock below.
    const reference = await prisma.saleInstallment.findUnique({
      where: { id },
      select: { id: true, saleId: true },
    });
    if (!reference) throw new NotFoundError('Installment not found.', 'INSTALLMENT_NOT_FOUND');

    return prisma.$transaction(async tx => {
      const lockedSaleRows = await tx.$queryRaw<Array<{ id: string }>>(
        Prisma.sql`SELECT "id" FROM "sale_records" WHERE "id" = ${reference.saleId} FOR UPDATE`
      );
      if (!lockedSaleRows.length)
        throw new NotFoundError('Installment not found.', 'INSTALLMENT_NOT_FOUND');

      // Read fresh state only after the sale lock. All payment entry points for
      // this sale must serialize on the same row to prevent concurrent overpay.
      const sale = await tx.saleRecord.findUnique({ where: { id: reference.saleId } });
      const installment = await tx.saleInstallment.findUnique({ where: { id } });
      if (!sale || !installment || installment.saleId !== sale.id || sale.sellerId !== sellerId) {
        throw new NotFoundError('Installment not found.', 'INSTALLMENT_NOT_FOUND');
      }

      const installmentPaid = roundMoney(Number(installment.paidAmount ?? 0));
      const installmentRemaining = roundMoney(Number(installment.amount) - installmentPaid);
      if (installmentRemaining <= 0 || amount > installmentRemaining) {
        throw new BadRequestError(
          'Payment exceeds the installment balance.',
          'PAYMENT_EXCEEDS_INSTALLMENT'
        );
      }

      const salePaidBefore = roundMoney(Number(sale.paidAmount));
      const netSaleTotal = roundMoney(Number(sale.totalPrice) - Number(sale.refundedAmount));
      const saleRemaining = roundMoney(Math.max(netSaleTotal - salePaidBefore, 0));
      if (amount > saleRemaining) {
        throw new BadRequestError(
          'Payment exceeds the remaining sale balance.',
          'PAYMENT_EXCEEDS_DUE'
        );
      }

      const paid = roundMoney(installmentPaid + amount);
      const status: InstallmentStatus = paid >= Number(installment.amount) ? 'PAID' : 'PARTIAL';
      const updated = await tx.saleInstallment.update({
        where: { id },
        data: { paidAmount: paid, paidAt: status === 'PAID' ? new Date() : undefined, status },
      });
      await tx.salePayment.create({
        data: {
          saleId: sale.id,
          amount,
          method: 'OTHER',
          note: `INSTALLMENT:${installment.installmentNo}`,
        },
      });

      const salePaid = roundMoney(salePaidBefore + amount);
      const due = roundMoney(Math.max(netSaleTotal - salePaid, 0));
      const paymentStatus =
        due <= 0
          ? 'PAID'
          : sale.dueDate && sale.dueDate < new Date()
            ? 'OVERDUE'
            : salePaid > 0
              ? 'PARTIAL'
              : 'UNPAID';
      await tx.saleRecord.update({
        where: { id: sale.id },
        data: { paidAmount: salePaid, dueAmount: due, paymentStatus },
      });

      // A refund can reduce the sale's net total below the installment schedule.
      // Once the sale is fully settled, no installment can still be collectible,
      // so close the remaining ones instead of leaving them PARTIAL/PENDING forever.
      let result = updated;
      if (due <= 0) {
        await tx.saleInstallment.updateMany({
          where: { saleId: sale.id, status: { not: 'PAID' } },
          data: { status: 'PAID', paidAt: new Date() },
        });
        result = { ...updated, status: 'PAID' as InstallmentStatus };
      }

      if (sale.customerId) {
        // Serialize aggregate refreshes with other sales/payments for this customer.
        // Locking only the sale is insufficient when two different sales for the same
        // customer are paid concurrently: both transactions could otherwise write stale totals.
        const lockedCustomer = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`SELECT "id" FROM "sales_customers" WHERE "id" = ${sale.customerId} AND "sellerId" = ${sellerId} FOR UPDATE`
        );
        if (lockedCustomer.length) {
          const aggregate = await tx.saleRecord.aggregate({
            where: { sellerId, customerId: sale.customerId },
            _sum: { totalPrice: true, refundedAmount: true, dueAmount: true },
            _count: { _all: true },
            _min: { soldAt: true },
            _max: { soldAt: true },
          });
          await tx.customer.update({
            where: { id: sale.customerId },
            data: {
              totalSpent: roundMoney(
                Number(aggregate._sum.totalPrice ?? 0) - Number(aggregate._sum.refundedAmount ?? 0)
              ),
              totalDue: roundMoney(Number(aggregate._sum.dueAmount ?? 0)),
              purchaseCount: aggregate._count._all,
              firstPurchaseAt: aggregate._min.soldAt,
              lastPurchaseAt: aggregate._max.soldAt,
            },
          });
        }
      }
      return result;
    });
  },
};
