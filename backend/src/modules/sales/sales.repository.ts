import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { ListSalesQuery } from './sales.validation';

const saleInclude = {
  customer: true,
  payments: { orderBy: { paidAt: 'asc' as const } },
  returns: { orderBy: { createdAt: 'asc' as const } },
  installments: { orderBy: { installmentNo: 'asc' as const } },
  store: { select: { id: true, name: true, slug: true, logoUrl: true } },
};

export const salesRepository = {
  findById: (id: string) => prisma.saleRecord.findUnique({ where: { id }, include: saleInclude }),
  findByIdTx: (tx: Prisma.TransactionClient, id: string) => tx.saleRecord.findUnique({ where: { id }, include: saleInclude }),

  findForSeller: async (sellerId: string, query: ListSalesQuery) => {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where: Prisma.SaleRecordWhereInput = {
      sellerId,
      ...(query.status ? { paymentStatus: query.status } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.from || query.to ? { soldAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) } } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.saleRecord.findMany({ where, include: saleInclude, orderBy: [{ soldAt: 'desc' }, { id: 'desc' }], skip, take }),
      prisma.saleRecord.count({ where }),
    ]);
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit), hasNextPage: page < Math.ceil(total / limit), hasPrevPage: page > 1 } };
  },

  create: (tx: Prisma.TransactionClient, data: Prisma.SaleRecordCreateInput) => tx.saleRecord.create({ data, include: saleInclude }),
  update: (id: string, data: Prisma.SaleRecordUpdateInput) => prisma.saleRecord.update({ where: { id }, data, include: saleInclude }),
  delete: (tx: Prisma.TransactionClient, id: string) => tx.saleRecord.delete({ where: { id } }),

  addPayment: (tx: Prisma.TransactionClient, data: Prisma.SalePaymentCreateInput) => tx.salePayment.create({ data }),
  addReturn: (tx: Prisma.TransactionClient, data: Prisma.SaleReturnCreateInput) => tx.saleReturn.create({ data }),

  summary: async (sellerId: string, from: Date, to: Date) => {
    const rows = await prisma.saleRecord.findMany({ where: { sellerId, soldAt: { gte: from, lt: to } }, select: { totalPrice: true, refundedAmount: true, costPrice: true, paidAmount: true, dueAmount: true, quantity: true, returns: { select: { quantity: true } } } });
    const totalRevenue = rows.reduce((s, r) => s + Number(r.totalPrice) - Number(r.refundedAmount), 0);
    const totalCost = rows.reduce((s, r) => { const returnedQty = r.returns.reduce((q, ret) => q + ret.quantity, 0); const netQty = Math.max(r.quantity - returnedQty, 0); return s + (r.costPrice === null ? 0 : Number(r.costPrice) * netQty); }, 0);
    return { salesCount: rows.length, quantity: rows.reduce((s, r) => s + r.quantity, 0), totalRevenue, totalCost, netProfit: totalRevenue - totalCost, totalPaid: rows.reduce((s, r) => s + Number(r.paidAmount), 0), totalRefunded: rows.reduce((s, r) => s + Number(r.refundedAmount), 0), totalDue: rows.reduce((s, r) => s + Number(r.dueAmount), 0) };
  },

  chart: async (sellerId: string, from: Date, to: Date) => prisma.saleRecord.findMany({ where: { sellerId, soldAt: { gte: from, lt: to } }, select: { soldAt: true, totalPrice: true, refundedAmount: true, paidAmount: true, dueAmount: true }, orderBy: { soldAt: 'asc' } }),

  topProducts: async (sellerId: string, limit: number) => prisma.saleRecord.groupBy({ by: ['entityId', 'entityTitle'], where: { sellerId, entityType: 'PRODUCT' }, _sum: { totalPrice: true, quantity: true }, _count: { id: true }, orderBy: { _sum: { totalPrice: 'desc' } }, take: limit }),

  topCustomers: async (sellerId: string, limit: number) => prisma.saleRecord.groupBy({ by: ['customerId', 'buyerName'], where: { sellerId, customerId: { not: null } }, _sum: { totalPrice: true }, _count: { id: true }, orderBy: { _sum: { totalPrice: 'desc' } }, take: limit }),

  debts: async (sellerId: string) => prisma.saleRecord.findMany({ where: { sellerId, dueAmount: { gt: 0 }, paymentStatus: { in: ['PARTIAL', 'UNPAID', 'OVERDUE'] } }, include: { customer: true }, orderBy: [{ dueDate: 'asc' }, { soldAt: 'asc' }] }),
};
