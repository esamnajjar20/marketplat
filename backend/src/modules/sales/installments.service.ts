import { prisma } from '../../config/prisma';
import { InstallmentStatus } from '@prisma/client';
import { salesService } from './sales.service';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { NotFoundError } from '../../shared/errors/NotFoundError';

const refreshStatus = (status: InstallmentStatus, dueDate: Date, paidAmount: number, amount: number): InstallmentStatus => {
  if (paidAmount >= amount) return 'PAID';
  if (paidAmount > 0) return 'PARTIAL';
  if (dueDate < new Date()) return 'OVERDUE';
  return status === 'OVERDUE' ? 'OVERDUE' : 'PENDING';
};

export const installmentsService = {
  upcoming: async (sellerId: string) => {
    const rows = await prisma.saleInstallment.findMany({ where: { sale: { sellerId }, status: { in: ['PENDING', 'PARTIAL'] }, dueDate: { gte: new Date() } }, include: { sale: { include: { customer: true } } }, orderBy: { dueDate: 'asc' }, take: 200 });
    return rows.map(r => ({ ...r, status: refreshStatus(r.status, r.dueDate, Number(r.paidAmount ?? 0), Number(r.amount)) }));
  },
  overdue: async (sellerId: string) => {
    const rows = await prisma.saleInstallment.findMany({ where: { sale: { sellerId }, dueDate: { lt: new Date() }, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } }, include: { sale: { include: { customer: true } } }, orderBy: { dueDate: 'asc' }, take: 200 });
    return rows.map(r => ({ ...r, status: refreshStatus(r.status, r.dueDate, Number(r.paidAmount ?? 0), Number(r.amount)) }));
  },
  pay: async (sellerId: string, id: string, amount: number) => {
    if (amount <= 0) throw new BadRequestError('Installment payment must be positive.', 'INVALID_INSTALLMENT_PAYMENT');
    const installment = await prisma.saleInstallment.findUnique({ where: { id }, include: { sale: true } });
    if (!installment || installment.sale.sellerId !== sellerId) throw new NotFoundError('Installment not found.', 'INSTALLMENT_NOT_FOUND');
    const remaining = Number(installment.amount) - Number(installment.paidAmount ?? 0);
    if (amount > remaining) throw new BadRequestError('Payment exceeds the installment balance.', 'PAYMENT_EXCEEDS_INSTALLMENT');
    return prisma.$transaction(async tx => {
      const paid = Number(installment.paidAmount ?? 0) + amount;
      const status = paid >= Number(installment.amount) ? 'PAID' : 'PARTIAL';
      const updated = await tx.saleInstallment.update({ where: { id }, data: { paidAmount: paid, paidAt: status === 'PAID' ? new Date() : undefined, status } });
      await tx.salePayment.create({ data: { saleId: installment.saleId, amount, method: 'OTHER', note: `INSTALLMENT:${installment.installmentNo}` } });
      const sale = await tx.saleRecord.findUnique({ where: { id: installment.saleId } });
      if (!sale) throw new NotFoundError('Sale not found.', 'SALE_NOT_FOUND');
      const salePaid = Number(sale.paidAmount) + amount;
      const due = Math.max(Number(sale.totalPrice) - salePaid, 0);
      await tx.saleRecord.update({ where: { id: sale.id }, data: { paidAmount: salePaid, dueAmount: due, paymentStatus: due <= 0 ? 'PAID' : sale.dueDate && sale.dueDate < new Date() ? 'OVERDUE' : 'PARTIAL' } });
      if (sale.customerId) {
        const rows = await tx.saleRecord.findMany({ where: { sellerId, customerId: sale.customerId }, select: { totalPrice: true, refundedAmount: true, dueAmount: true, soldAt: true } });
        await tx.customer.update({ where: { id: sale.customerId }, data: { totalSpent: rows.reduce((s,r)=>s+Number(r.totalPrice)-Number(r.refundedAmount),0), totalDue: rows.reduce((s,r)=>s+Number(r.dueAmount),0), purchaseCount: rows.length, firstPurchaseAt: rows.reduce<Date|null>((m,r)=>!m||r.soldAt<m?r.soldAt:m,null), lastPurchaseAt: rows.reduce<Date|null>((m,r)=>!m||r.soldAt>m?r.soldAt:m,null) } });
      }
      return updated;
    });
  },
};
