import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { ListSalesQuery } from './sales.validation';

const saleInclude = {
  customer: true,
  items: { orderBy: { createdAt: 'asc' as const } },
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
    const rows = await prisma.saleRecord.findMany({
      where: { sellerId, soldAt: { gte: from, lt: to } },
      select: { totalPrice: true, refundedAmount: true, paidAmount: true, dueAmount: true, quantity: true, items: { select: { quantity: true, returnedQuantity: true, costPrice: true, lineTotal: true } } },
    });
    const totalRevenue = rows.reduce((sum, r) => sum + Number(r.totalPrice) - Number(r.refundedAmount), 0);
    const totalCost = rows.reduce((sum, r) => {
      if (r.items.length) return sum + r.items.reduce((itemSum, item) => itemSum + (item.costPrice === null ? 0 : Number(item.costPrice) * Math.max(item.quantity - item.returnedQuantity, 0)), 0);
      return sum;
    }, 0);
    return {
      salesCount: rows.length,
      quantity: rows.reduce((sum, r) => sum + r.quantity, 0),
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      netProfit: Math.round((totalRevenue - totalCost) * 100) / 100,
      totalPaid: rows.reduce((sum, r) => sum + Number(r.paidAmount), 0),
      totalRefunded: rows.reduce((sum, r) => sum + Number(r.refundedAmount), 0),
      totalDue: rows.reduce((sum, r) => sum + Number(r.dueAmount), 0),
    };
  },

  chart: async (sellerId: string, from: Date, to: Date) => prisma.saleRecord.findMany({ where: { sellerId, soldAt: { gte: from, lt: to } }, select: { soldAt: true, totalPrice: true, refundedAmount: true, paidAmount: true, dueAmount: true }, orderBy: { soldAt: 'asc' } }),

  topProducts: async (sellerId: string, limit: number) => {
    const items = await prisma.saleItem.findMany({ where: { sale: { sellerId }, entityType: 'PRODUCT' }, select: { productId: true, title: true, quantity: true, returnedQuantity: true, lineTotal: true, costPrice: true } });
    const grouped = new Map<string, { productId: string | null; title: string; quantity: number; revenue: number; profit: number }>();
    for (const item of items) {
      const key = item.productId ?? item.title;
      const current = grouped.get(key) ?? { productId: item.productId, title: item.title, quantity: 0, revenue: 0, profit: 0 };
      const netQty = Math.max(item.quantity - item.returnedQuantity, 0);
      const revenue = Number(item.lineTotal) * (netQty / Math.max(item.quantity, 1));
      const cost = item.costPrice === null ? 0 : Number(item.costPrice) * netQty;
      current.quantity += netQty; current.revenue += revenue; current.profit += revenue - cost;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a,b) => b.revenue - a.revenue).slice(0, limit).map(x => ({ ...x, revenue: Math.round(x.revenue*100)/100, profit: Math.round(x.profit*100)/100 }));
  },

  topCustomers: async (sellerId: string, limit: number) => prisma.saleRecord.groupBy({ by: ['customerId', 'buyerName'], where: { sellerId, customerId: { not: null } }, _sum: { totalPrice: true }, _count: { id: true }, orderBy: { _sum: { totalPrice: 'desc' } }, take: limit }),

  debts: async (sellerId: string) => prisma.saleRecord.findMany({ where: { sellerId, dueAmount: { gt: 0 }, paymentStatus: { in: ['PARTIAL', 'UNPAID', 'OVERDUE'] } }, include: { customer: true }, orderBy: [{ dueDate: 'asc' }, { soldAt: 'asc' }] }),
};
