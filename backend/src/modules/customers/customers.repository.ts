import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export const customersRepository = {
  findById: (id: string) => prisma.customer.findUnique({ where: { id }, include: { sales: { orderBy: { soldAt: 'desc' }, take: 100 } } }),
  findBySellerAndId: (sellerId: string, id: string) => prisma.customer.findFirst({ where: { id, sellerId }, include: { sales: { orderBy: { soldAt: 'desc' }, take: 100 } } }),
  findByPhone: (sellerId: string, phone: string) => prisma.customer.findFirst({ where: { sellerId, phone } }),
  create: (data: Prisma.CustomerCreateInput) => prisma.customer.create({ data }),
  update: (id: string, data: Prisma.CustomerUpdateInput) => prisma.customer.update({ where: { id }, data }),
  list: async (sellerId: string, opts: { page?: number; limit?: number; q?: string; dueOnly?: boolean }) => {
    const { page, limit, skip, take } = getPaginationParams(opts);
    const where: Prisma.CustomerWhereInput = {
      sellerId,
      ...(opts.dueOnly ? { totalDue: { gt: 0 } } : {}),
      ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: 'insensitive' } }, { phone: { contains: opts.q } }] } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.customer.findMany({ where, orderBy: [{ lastPurchaseAt: 'desc' }, { name: 'asc' }], skip, take }),
      prisma.customer.count({ where }),
    ]);
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit), hasNextPage: page < Math.ceil(total / limit), hasPrevPage: page > 1 } };
  },
  summary: async (sellerId: string) => {
    const [totalCustomers, vipCustomers, debtors, inactiveCustomers, spent] = await Promise.all([
      prisma.customer.count({ where: { sellerId } }),
      prisma.customer.count({ where: { sellerId, isVip: true } }),
      prisma.customer.count({ where: { sellerId, totalDue: { gt: 0 } } }),
      prisma.customer.count({ where: { sellerId, OR: [{ lastPurchaseAt: null }, { lastPurchaseAt: { lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } }] } }),
      prisma.customer.aggregate({ where: { sellerId }, _sum: { totalSpent: true }, _avg: { totalSpent: true } }),
    ]);
    return { totalCustomers, vipCustomers, debtors, inactiveCustomers, totalSpent: Number(spent._sum.totalSpent ?? 0), averageCustomerSpend: Number(spent._avg.totalSpent ?? 0) };
  },
  search: (sellerId: string, q: string) => prisma.customer.findMany({ where: { sellerId, OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] }, orderBy: [{ lastPurchaseAt: 'desc' }, { name: 'asc' }], take: 10 }),
};
