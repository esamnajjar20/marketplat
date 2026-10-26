import { prisma } from '../../config/prisma';
import { MarketplaceOrderStatus, Prisma } from '@prisma/client';

const orderInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  store: { select: { id: true, name: true, logoUrl: true, city: true, phone: true } },
  buyer: { select: { id: true, name: true, phone: true } },
  seller: { select: { id: true, name: true, phone: true } },
};
export const marketplaceOrdersRepository = {
  findById: (id: string) => prisma.marketplaceOrder.findUnique({ where: { id }, include: orderInclude }),
  findByIdempotencyKey: (buyerId: string, idempotencyKey: string) => prisma.marketplaceOrder.findUnique({ where: { buyerId_idempotencyKey: { buyerId, idempotencyKey } }, include: orderInclude }),
  listForBuyer: async (buyerId: string, page: number, limit: number, status?: MarketplaceOrderStatus) => {
    const where = { buyerId, ...(status ? { status } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.marketplaceOrder.findMany({ where, include: orderInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.marketplaceOrder.count({ where }),
    ]);
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },
  listForSeller: async (sellerId: string, page: number, limit: number, status?: MarketplaceOrderStatus) => {
    const where = { sellerId, ...(status ? { status } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.marketplaceOrder.findMany({ where, include: orderInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      prisma.marketplaceOrder.count({ where }),
    ]);
    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  },
  create: (tx: Prisma.TransactionClient, data: Prisma.MarketplaceOrderCreateInput) => tx.marketplaceOrder.create({ data, include: orderInclude }),
  updateStatus: (id: string, status: MarketplaceOrderStatus, sellerNote?: string | null) => prisma.marketplaceOrder.update({ where: { id }, data: { status, ...(sellerNote !== undefined ? { sellerNote } : {}), ...(status === 'CONFIRMED' ? { confirmedAt: new Date() } : {}), ...(status === 'SHIPPED' ? { shippedAt: new Date() } : {}), ...(status === 'DELIVERED' ? { deliveredAt: new Date() } : {}), ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}) }, include: orderInclude }),
};
