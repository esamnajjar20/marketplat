import { MarketplaceOrderStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ConflictError } from '../../shared/errors/ConflictError';
import { getPaginationParams } from '../../shared/utils/pagination';
import { marketplaceOrdersRepository } from './marketplace-orders.repository';

type CreateOrderInput = { items: { productId: string; quantity: number }[]; recipientName: string; recipientPhone: string; shippingCity: string; shippingAddress: string; buyerNote?: string | null; idempotencyKey?: string };
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const marketplaceOrdersService = {
  create: async (buyerId: string, input: CreateOrderInput) => {
    if (input.idempotencyKey) {
      const existing = await marketplaceOrdersRepository.findByIdempotencyKey(buyerId, input.idempotencyKey);
      if (existing) return existing;
    }
    try {
      return await prisma.$transaction(async tx => {
        const buyer = await tx.user.findUnique({ where: { id: buyerId }, select: { isActive: true } });
        if (!buyer?.isActive) throw new ForbiddenError('Your account is not active.', 'ACCOUNT_INACTIVE');
        const ids = input.items.map(item => item.productId).sort();
        // Stable order for product row locks reduces deadlock risk for concurrent multi-item checkouts.
        for (const id of ids) await tx.$queryRaw`SELECT "id" FROM "products" WHERE "id" = ${id} FOR UPDATE`;
        const now = new Date();
        const products = await tx.product.findMany({
          where: { id: { in: ids } },
          include: {
            store: { include: { sellerProfile: { include: { user: { select: { isActive: true } } } } } },
            promotions: {
              where: {
                status: { in: ['SCHEDULED', 'ACTIVE'] },
                startsAt: { lte: now },
                endsAt: { gt: now },
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });
        if (products.length !== ids.length) throw new NotFoundError('One or more products were not found.', 'PRODUCT_NOT_FOUND');
        const storeIds = new Set(products.map(product => product.storeId));
        if (storeIds.size !== 1) throw new BadRequestError('A single order can contain products from only one store.', 'ORDER_MULTIPLE_STORES');
        const store = products[0].store;
        if (store.status !== 'ACTIVE' || store.sellerProfile.suspended || !store.sellerProfile.user.isActive) throw new ConflictError('This store is not currently accepting orders.', 'STORE_NOT_AVAILABLE');
        if (store.sellerProfile.userId === buyerId) throw new BadRequestError('You cannot order products from your own store.', 'ORDER_OWN_STORE');
        const items: { productId: string; productName: string; productImage: string | null; quantity: number; unitPrice: number; lineTotal: number }[] = [];
        let subtotal = 0;
        for (const requested of input.items) {
          const product = products.find(candidate => candidate.id === requested.productId)!;
          if (product.status !== 'ACTIVE' || product.availability === 'OUT_OF_STOCK') throw new ConflictError(`Product "${product.name}" is not available.`, 'PRODUCT_UNAVAILABLE');
          if (product.stockQuantity !== null && product.stockQuantity < requested.quantity) throw new ConflictError(`Insufficient stock for "${product.name}".`, 'INSUFFICIENT_STOCK');
          const basePrice = Number(product.price);
          const candidatePromotion = product.promotions[0];
          const promotion = candidatePromotion && (candidatePromotion.maxUses === null || candidatePromotion.usageCount < candidatePromotion.maxUses) ? candidatePromotion : null;
          let unitPrice = product.discountPrice !== null ? Math.min(basePrice, Number(product.discountPrice)) : basePrice;
          if (promotion) {
            const usageGuard = await tx.promotion.updateMany({ where: { id: promotion.id, ...(promotion.maxUses !== null ? { usageCount: { lt: promotion.maxUses } } : {}) }, data: { usageCount: { increment: 1 } } });
            if (usageGuard.count !== 1) throw new ConflictError('This promotion is no longer available. Please retry the order.', 'PROMOTION_EXHAUSTED');
            const discountValue = Number(promotion.discountValue);
            unitPrice = promotion.discountType === 'PERCENTAGE' ? basePrice * (1 - discountValue / 100) : Math.max(basePrice - discountValue, 0);
          }
          unitPrice = roundMoney(unitPrice);
          const lineTotal = roundMoney(unitPrice * requested.quantity);
          subtotal = roundMoney(subtotal + lineTotal);
          items.push({ productId: product.id, productName: product.name, productImage: product.images[0] ?? null, quantity: requested.quantity, unitPrice, lineTotal });
        }
        // Conditional stock decrement is the final concurrency guard, even after row locks.
        for (const item of items) {
          const product = products.find(candidate => candidate.id === item.productId)!;
          if (product.stockQuantity !== null) {
            const remainingStock = product.stockQuantity - item.quantity;
            const updated = await tx.product.updateMany({ where: { id: product.id, status: 'ACTIVE', stockQuantity: { gte: item.quantity } }, data: { stockQuantity: { decrement: item.quantity }, availability: remainingStock <= 0 ? 'OUT_OF_STOCK' : remainingStock <= 5 ? 'LIMITED' : 'IN_STOCK' } });
            if (updated.count !== 1) throw new ConflictError(`Insufficient stock for "${product.name}".`, 'INSUFFICIENT_STOCK');
          }
        }
        // Shipping has no store-configured tariff yet; do not trust a client-supplied fee.
        const shippingFee = 0;
        const total = roundMoney(subtotal + shippingFee);
        const data: Prisma.MarketplaceOrderCreateInput = {
          buyer: { connect: { id: buyerId } }, seller: { connect: { id: store.sellerProfile.userId } }, store: { connect: { id: store.id } },
          currency: 'ILS', subtotal, shippingFee, total, recipientName: input.recipientName, recipientPhone: input.recipientPhone, shippingCity: input.shippingCity, shippingAddress: input.shippingAddress,
          buyerNote: input.buyerNote || null, idempotencyKey: input.idempotencyKey || null,
          items: { create: items.map(item => ({ product: { connect: { id: item.productId } }, productName: item.productName, productImage: item.productImage, quantity: item.quantity, unitPrice: item.unitPrice, lineTotal: item.lineTotal })) },
        };
        const order = await marketplaceOrdersRepository.create(tx, data);
        for (const item of items) {
          const product = products.find(candidate => candidate.id === item.productId)!;
          if (product.stockQuantity !== null) {
            await tx.stockMovement.create({ data: {
              productId: product.id,
              storeId: store.id,
              changedByUserId: buyerId,
              previousQuantity: product.stockQuantity,
              newQuantity: product.stockQuantity - item.quantity,
              delta: -item.quantity,
              reason: `Marketplace order ${order.id} reservation`,
            } });
          }
        }
        return order;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 20000 });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002' && input.idempotencyKey) {
        const existing = await marketplaceOrdersRepository.findByIdempotencyKey(buyerId, input.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
  },
  listMine: async (userId: string, query: { page?: number; limit?: number; status?: MarketplaceOrderStatus }) => {
    const { page, limit } = getPaginationParams(query);
    return marketplaceOrdersRepository.listForBuyer(userId, page, limit, query.status);
  },
  listForStore: async (userId: string, query: { page?: number; limit?: number; status?: MarketplaceOrderStatus }) => {
    const { page, limit } = getPaginationParams(query);
    return marketplaceOrdersRepository.listForSeller(userId, page, limit, query.status);
  },
  getById: async (userId: string, id: string) => {
    const order = await marketplaceOrdersRepository.findById(id);
    if (!order) throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
    if (order.buyerId !== userId && order.sellerId !== userId) throw new ForbiddenError('You cannot access this order.', 'ORDER_FORBIDDEN');
    return order;
  },
  updateStatus: async (userId: string, id: string, nextStatus: MarketplaceOrderStatus, sellerNote?: string | null) => {
    return prisma.$transaction(async tx => {
      const order = await tx.marketplaceOrder.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new NotFoundError('Order not found.', 'ORDER_NOT_FOUND');
      if (order.sellerId !== userId && order.buyerId !== userId) throw new ForbiddenError('You cannot update this order.', 'ORDER_FORBIDDEN');
      if (nextStatus === 'CANCELLED') {
        if (order.status !== 'PENDING' && !(order.status === 'CONFIRMED' && order.sellerId === userId)) throw new ConflictError('This order can no longer be cancelled.', 'ORDER_CANNOT_CANCEL');
        if (order.buyerId !== userId && order.sellerId !== userId) throw new ForbiddenError();
        for (const item of order.items) {
          if (!item.productId) continue;
          const product = await tx.product.findUnique({ where: { id: item.productId }, select: { stockQuantity: true } });
          if (product?.stockQuantity !== null && product?.stockQuantity !== undefined) {
            const previousQuantity = product.stockQuantity;
            const restored = previousQuantity + item.quantity;
            await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity }, availability: restored <= 5 ? 'LIMITED' : 'IN_STOCK' } });
            await tx.stockMovement.create({ data: {
              productId: item.productId,
              storeId: order.storeId,
              changedByUserId: userId,
              previousQuantity,
              newQuantity: restored,
              delta: item.quantity,
              reason: `Marketplace order ${order.id} cancellation`,
            } });
          }
        }
      } else {
        if (order.sellerId !== userId) throw new ForbiddenError('Only the store can advance order status.', 'ORDER_SELLER_ONLY');
        const allowed: Record<string, string[]> = { PENDING: ['CONFIRMED'], CONFIRMED: ['PROCESSING'], PROCESSING: ['SHIPPED'], SHIPPED: ['DELIVERED'] };
        if (!(allowed[order.status] ?? []).includes(nextStatus)) throw new ConflictError('Invalid order status transition.', 'ORDER_INVALID_TRANSITION');
      }
      return tx.marketplaceOrder.update({ where: { id }, data: { status: nextStatus, ...(sellerNote !== undefined ? { sellerNote } : {}), ...(nextStatus === 'CONFIRMED' ? { confirmedAt: new Date() } : {}), ...(nextStatus === 'SHIPPED' ? { shippedAt: new Date() } : {}), ...(nextStatus === 'DELIVERED' ? { deliveredAt: new Date(), paymentStatus: 'PAID' } : {}), ...(nextStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {}) }, include: { items: true, store: { select: { id: true, name: true, logoUrl: true, city: true, phone: true } }, buyer: { select: { id: true, name: true, phone: true } }, seller: { select: { id: true, name: true, phone: true } } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  },
};
