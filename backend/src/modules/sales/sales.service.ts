import { prisma } from '../../config/prisma';
import { Prisma, SalePaymentStatus } from '@prisma/client';
import { salesRepository } from './sales.repository';
import { invoicesService } from './invoices.service';
import { notificationsService } from '../notifications/notifications.service';
import { customersService } from '../customers/customers.service';
import { requireStoreAccess } from '../stores/store-members.service';
import { CreateSaleInput, UpdateSaleInput, ListSalesQuery, AddPaymentInput, ReturnSaleInput, UpdateCostSettingsInput, UpdateProductCostInput } from './sales.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { ConflictError } from '../../shared/errors/ConflictError';

const roundMoney = (n: number) => Math.round(n * 100) / 100;
const computeStatus = (total: number, paid: number, dueDate?: Date | null): SalePaymentStatus => {
  const due = roundMoney(Math.max(total - paid, 0));
  if (due <= 0) return 'PAID';
  if (paid <= 0 && dueDate && dueDate < new Date()) return 'OVERDUE';
  if (dueDate && dueDate < new Date()) return 'OVERDUE';
  return paid > 0 ? 'PARTIAL' : 'UNPAID';
};

const ensureEntityOwnership = async (userId: string, input: CreateSaleInput) => {
  if (input.entityType === 'FREE') return { storeId: input.storeId ?? null, costPrice: input.costPrice ?? null, imageUrl: input.entityImageUrl ?? null };

  if (!input.entityId) throw new BadRequestError('entityId is required for this sale type.', 'SALE_ENTITY_ID_REQUIRED');

  if (input.entityType === 'PRODUCT') {
    const product = await prisma.product.findUnique({ where: { id: input.entityId }, select: { id: true, name: true, images: true, price: true, wholesalePrice: true, costPrice: true, storeId: true, status: true } });
    if (!product || product.status === 'DELETED') throw new NotFoundError('Product not found.', 'PRODUCT_NOT_FOUND');
    const access = await requireStoreAccess(userId, product.storeId, 'manageProducts');
    if (input.storeId && input.storeId !== product.storeId) throw new BadRequestError('storeId does not match the selected product.', 'STORE_PRODUCT_MISMATCH');
    return { storeId: access.store.id, costPrice: input.costPrice ?? (product.costPrice == null ? null : Number(product.costPrice)), imageUrl: input.entityImageUrl ?? product.images[0] ?? null };
  }

  if (input.entityType === 'AD') {
    const ad = await prisma.ad.findUnique({ where: { id: input.entityId }, select: { id: true, userId: true, storeId: true, title: true, images: true, status: true } });
    if (!ad) throw new NotFoundError('Ad not found.', 'AD_NOT_FOUND');
    if (ad.userId !== userId) throw new ForbiddenError('You do not own this ad.', 'NOT_YOUR_AD');
    if (input.storeId && input.storeId !== ad.storeId) throw new BadRequestError('storeId does not match the selected ad.', 'STORE_AD_MISMATCH');
    if (ad.storeId) await requireStoreAccess(userId, ad.storeId, 'manageAds');
    return { storeId: ad.storeId, costPrice: input.costPrice ?? null, imageUrl: input.entityImageUrl ?? ad.images[0] ?? null };
  }

  const listing = await prisma.serviceListing.findUnique({ where: { id: input.entityId }, include: { provider: { select: { sellerProfile: { select: { userId: true } } } } } });
  if (!listing) throw new NotFoundError('Service listing not found.', 'SERVICE_NOT_FOUND');
  if (listing.provider.sellerProfile.userId !== userId) throw new ForbiddenError('You do not own this service.', 'NOT_YOUR_SERVICE');
  if (input.serviceRequestId) {
    const request = await prisma.serviceRequest.findUnique({ where: { id: input.serviceRequestId }, select: { listingId: true } });
    if (!request || request.listingId !== listing.id) throw new BadRequestError('serviceRequestId does not belong to the selected service.', 'SERVICE_REQUEST_MISMATCH');
  }
  if (input.storeId) await requireStoreAccess(userId, input.storeId, 'manageProducts');
  return { storeId: input.storeId ?? null, costPrice: input.costPrice ?? null, imageUrl: input.entityImageUrl ?? listing.images[0] ?? null };
};

const resolveCustomer = async (tx: Prisma.TransactionClient, sellerId: string, input: CreateSaleInput) => {
  if (input.customerId) {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, sellerId } });
    if (!customer) throw new NotFoundError('Customer not found.', 'CUSTOMER_NOT_FOUND');
    return customer;
  }
  const phone = customersService.normalizePhone(input.buyerPhone);
  if (!phone) return null;
  const existing = await tx.customer.findFirst({ where: { sellerId, phone } });
  if (existing) return existing;
  return tx.customer.create({ data: { seller: { connect: { id: sellerId } }, name: input.buyerName, phone, tags: [] } });
};

const recomputeCustomer = async (tx: Prisma.TransactionClient, sellerId: string, customerId: string) => {
  const rows = await tx.saleRecord.findMany({ where: { sellerId, customerId }, select: { totalPrice: true, refundedAmount: true, dueAmount: true, soldAt: true } });
  const first = rows.reduce<Date | null>((min, r) => !min || r.soldAt < min ? r.soldAt : min, null);
  const last = rows.reduce<Date | null>((max, r) => !max || r.soldAt > max ? r.soldAt : max, null);
  await tx.customer.update({ where: { id: customerId }, data: { totalSpent: rows.reduce((s, r) => s + Number(r.totalPrice) - Number(r.refundedAmount), 0), totalDue: rows.reduce((s, r) => s + Number(r.dueAmount), 0), purchaseCount: rows.length, firstPurchaseAt: first, lastPurchaseAt: last } });
};

const lockProduct = async (tx: Prisma.TransactionClient, productId: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string; storeId: string; stockQuantity: number | null }>>(Prisma.sql`SELECT "id", "storeId", "stockQuantity" FROM "products" WHERE "id" = ${productId} FOR UPDATE`);
  const product = rows[0];
  if (!product) throw new NotFoundError('Product not found.', 'PRODUCT_NOT_FOUND');
  return product;
};

const refreshSalesStatsCache = async (sellerId: string, storeId: string | null) => {
  if (!storeId) return;
  try {
    const [aggregate, seller] = await Promise.all([
      prisma.saleRecord.aggregate({ where: { sellerId, storeId }, _count: { id: true }, _sum: { totalPrice: true, refundedAmount: true } }),
      prisma.sellerProfile.findUnique({ where: { userId: sellerId }, select: { verified: true, averageRating: true, totalRatings: true } }),
    ]);
    await prisma.salesStatsCache.upsert({
      where: { sellerId },
      create: { sellerId, storeId, totalSales: aggregate._count.id, totalRevenue: Number(aggregate._sum.totalPrice ?? 0) - Number(aggregate._sum.refundedAmount ?? 0), averageRating: seller?.averageRating ?? null, reviewCount: seller?.totalRatings ?? 0, verifiedSeller: seller?.verified ?? false },
      update: { storeId, totalSales: aggregate._count.id, totalRevenue: Number(aggregate._sum.totalPrice ?? 0) - Number(aggregate._sum.refundedAmount ?? 0), averageRating: seller?.averageRating ?? null, reviewCount: seller?.totalRatings ?? 0, verifiedSeller: seller?.verified ?? false },
    });
  } catch {
    // Cache failure must never fail an already committed sale.
  }
};

export const salesService = {
  getCostSettings: async (userId: string) => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { salesCostTrackingEnabled: true } });
    return { enabled: user?.salesCostTrackingEnabled ?? true };
  },

  updateCostSettings: async (userId: string, input: UpdateCostSettingsInput) => {
    const user = await prisma.user.update({ where: { id: userId }, data: { salesCostTrackingEnabled: input.enabled }, select: { salesCostTrackingEnabled: true } });
    return { enabled: user.salesCostTrackingEnabled };
  },

  listCostProducts: async (userId: string) => {
    return prisma.product.findMany({
      where: {
        status: { not: 'DELETED' },
        store: { sellerProfile: { userId } },
      },
      select: { id: true, storeId: true, name: true, price: true, costPrice: true, stockQuantity: true, availability: true, images: true, store: { select: { id: true, name: true } } },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
  },

  updateProductCost: async (userId: string, productId: string, input: UpdateProductCostInput) => {
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, storeId: true } });
    if (!product) throw new NotFoundError('Product not found.', 'PRODUCT_NOT_FOUND');
    const store = await prisma.storeDetails.findFirst({ where: { id: product.storeId, sellerProfile: { userId } }, select: { id: true } });
    if (!store) throw new ForbiddenError('You do not own this product.', 'NOT_YOUR_PRODUCT');
    return prisma.product.update({ where: { id: productId }, data: { costPrice: input.costPrice }, select: { id: true, storeId: true, name: true, price: true, costPrice: true, stockQuantity: true, availability: true, images: true, store: { select: { id: true, name: true } } } });
  },

  create: async (userId: string, input: CreateSaleInput, offlineOperationId?: string) => {
    if (offlineOperationId) {
      const existing = await prisma.saleRecord.findFirst({ where: { sellerId: userId, offlineOperationId } });
      if (existing) return salesRepository.findById(existing.id);
    }
    const entity = await ensureEntityOwnership(userId, input);
    const costTracking = await salesService.getCostSettings(userId);
    const effectiveCostPrice = costTracking.enabled ? entity.costPrice : null;
    const total = roundMoney(input.unitPrice * input.quantity);
    const initialPaid = roundMoney(input.payment?.amount ?? input.paidAmount ?? 0);
    if (initialPaid > total) throw new BadRequestError('Paid amount cannot exceed total.', 'PAYMENT_EXCEEDS_TOTAL');

    return prisma.$transaction(async tx => {
      const customer = await resolveCustomer(tx, userId, input);
      const invoiceNumber = await invoicesService.nextInvoiceNumber(tx, userId);
      const dueAmount = roundMoney(total - initialPaid);
      const status = computeStatus(total, initialPaid, input.dueDate);

      const sale = await salesRepository.create(tx, {
        seller: { connect: { id: userId } },
        ...(entity.storeId ? { store: { connect: { id: entity.storeId } } } : {}),
        ...(customer ? { customer: { connect: { id: customer.id } } } : {}),
        ...(input.serviceRequestId ? { serviceRequest: { connect: { id: input.serviceRequestId } } } : {}),
        entityType: input.entityType,
        entityId: input.entityId,
        entityTitle: input.entityTitle,
        entityImageUrl: entity.imageUrl,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        costPrice: effectiveCostPrice,
        totalPrice: total,
        currency: input.currency,
        invoiceNumber,
        buyerName: input.buyerName,
        buyerPhone: customersService.normalizePhone(input.buyerPhone),
        paymentStatus: status,
        paidAmount: initialPaid,
        dueAmount,
        dueDate: input.dueDate,
        note: input.note,
        internalNote: input.internalNote,
        soldAt: input.soldAt ?? new Date(),
        offlineOperationId: offlineOperationId ?? null,
      });

      if (input.payments?.length) {
        const paymentTotal = roundMoney(input.payments.reduce((sum, payment) => sum + payment.amount, 0));
        if (paymentTotal !== initialPaid) throw new BadRequestError('Payment methods total must equal paidAmount.', 'PAYMENTS_TOTAL_MISMATCH');
        for (const payment of input.payments) {
          await salesRepository.addPayment(tx, { sale: { connect: { id: sale.id } }, amount: payment.amount, method: payment.method, transferRef: payment.transferRef, note: payment.note });
        }
      } else if (input.payment && initialPaid > 0) {
        await salesRepository.addPayment(tx, { sale: { connect: { id: sale.id } }, amount: initialPaid, method: input.payment.method, transferRef: input.payment.transferRef, note: input.payment.note });
      }

      if (input.installments?.length) {
        const seen = new Set<number>();
        for (const installment of input.installments) {
          if (seen.has(installment.installmentNo)) throw new BadRequestError('Duplicate installment number.', 'DUPLICATE_INSTALLMENT_NO');
          seen.add(installment.installmentNo);
        }
        await tx.saleInstallment.createMany({ data: input.installments.map(i => ({ saleId: sale.id, installmentNo: i.installmentNo, amount: i.amount, dueDate: i.dueDate, note: i.note })) });
      }

      if (input.entityType === 'PRODUCT' && input.entityId) {
        const product = await lockProduct(tx, input.entityId);
        if (product.storeId !== entity.storeId) throw new ConflictError('Product store changed during sale.', 'PRODUCT_STORE_CHANGED');
        const previous = product.stockQuantity;
        const next = previous === null ? null : previous - input.quantity;
        const movement = await tx.stockMovement.create({ data: { productId: product.id, storeId: product.storeId, changedByUserId: userId, previousQuantity: previous, newQuantity: next, delta: -input.quantity, reason: `SALE:${sale.id}` } });
        await tx.saleRecord.update({ where: { id: sale.id }, data: { stockMovementId: movement.id } });
        if (next !== null) await tx.product.update({ where: { id: product.id }, data: { stockQuantity: next, availability: next <= 0 ? 'OUT_OF_STOCK' : next <= 5 ? 'LIMITED' : 'IN_STOCK' } });
      }

      if (customer) await recomputeCustomer(tx, userId, customer.id);
      return salesRepository.findByIdTx(tx, sale.id);
    }).then(async created => {
      await refreshSalesStatsCache(userId, entity.storeId);
      if (input.entityType === 'PRODUCT' && input.entityId) {
        const product = await prisma.product.findUnique({ where: { id: input.entityId }, select: { name: true, stockQuantity: true } });
        if (product?.stockQuantity !== null && product?.stockQuantity !== undefined && product.stockQuantity <= 5) {
          await notificationsService.createSellerAlertOnce(userId, 'lowStockAlerts', 'SALES_LOW_STOCK', 'مخزون منخفض', `تبقى ${product.stockQuantity} من ${product.name}.`, new Date(Date.now()-24*60*60*1000), { productId: input.entityId, targetType: 'PRODUCT', targetId: input.entityId });
        }
      }
      return created;
    }).catch(async error => {
      if (offlineOperationId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await prisma.saleRecord.findFirst({ where: { sellerId: userId, offlineOperationId } });
        if (existing) return salesRepository.findById(existing.id);
      }
      throw error;
    });
  },

  list: (userId: string, query: ListSalesQuery) => salesRepository.findForSeller(userId, query),

  getById: async (userId: string, id: string) => {
    const sale = await salesRepository.findById(id);
    if (!sale || sale.sellerId !== userId) throw new NotFoundError('Sale not found.', 'SALE_NOT_FOUND');
    return sale;
  },

  update: async (userId: string, id: string, input: UpdateSaleInput) => {
    const sale = await salesService.getById(userId, id);
    const dueDate = input.dueDate === undefined ? sale.dueDate : input.dueDate;
    const netTotal = Number(sale.totalPrice) - Number(sale.refundedAmount);
    return salesRepository.update(sale.id, { ...input, paymentStatus: computeStatus(netTotal, Number(sale.paidAmount), dueDate), dueAmount: roundMoney(Math.max(netTotal - Number(sale.paidAmount), 0)) });
  },

  remove: async (userId: string, id: string) => {
    const sale = await salesService.getById(userId, id);
    return prisma.$transaction(async tx => {
      if (sale.entityType === 'PRODUCT' && sale.entityId) {
        const product = await lockProduct(tx, sale.entityId);
        const returnedQty = sale.returns.reduce((s, r) => s + r.quantity, 0);
        const restoreQty = Math.max(sale.quantity - returnedQty, 0);
        if (product.stockQuantity !== null && restoreQty > 0) {
          const next = product.stockQuantity + restoreQty;
          await tx.stockMovement.create({ data: { productId: product.id, storeId: product.storeId, changedByUserId: userId, previousQuantity: product.stockQuantity, newQuantity: next, delta: restoreQty, reason: `SALE_DELETE:${sale.id}` } });
          await tx.product.update({ where: { id: product.id }, data: { stockQuantity: next, availability: next <= 0 ? 'OUT_OF_STOCK' : next <= 5 ? 'LIMITED' : 'IN_STOCK' } });
        }
      }
      await salesRepository.delete(tx, sale.id);
      if (sale.customerId) await recomputeCustomer(tx, userId, sale.customerId);
    });
  },

  addPayment: async (userId: string, id: string, input: AddPaymentInput) => {
    const sale = await salesService.getById(userId, id);
    if (input.amount > Number(sale.dueAmount)) throw new BadRequestError('Payment exceeds the remaining due amount.', 'PAYMENT_EXCEEDS_DUE');
    return prisma.$transaction(async tx => {
      await salesRepository.addPayment(tx, { sale: { connect: { id } }, amount: input.amount, method: input.method, transferRef: input.transferRef, paidAt: input.paidAt, note: input.note });
      const paid = roundMoney(Number(sale.paidAmount) + input.amount);
      const due = roundMoney(Math.max(Number(sale.totalPrice) - Number(sale.refundedAmount) - paid, 0));
      const status = computeStatus(Number(sale.totalPrice) - Number(sale.refundedAmount), paid, sale.dueDate);
      await tx.saleRecord.update({ where: { id }, data: { paidAmount: paid, dueAmount: due, paymentStatus: status } });
      if (sale.customerId) await recomputeCustomer(tx, userId, sale.customerId);
      return salesRepository.findByIdTx(tx, id);
    });
  },

  addReturn: async (userId: string, id: string, input: ReturnSaleInput) => {
    const sale = await salesService.getById(userId, id);
    const alreadyReturned = sale.returns.reduce((s, r) => s + r.quantity, 0);
    if (alreadyReturned + input.quantity > sale.quantity) throw new BadRequestError('Returned quantity exceeds sold quantity.', 'RETURN_QUANTITY_EXCEEDED');
    const remainingRefundable = roundMoney(Number(sale.totalPrice) - Number(sale.refundedAmount));
    if (input.refundAmount > remainingRefundable) throw new BadRequestError('Refund exceeds the remaining sale value.', 'REFUND_EXCEEDS_SALE');
    return prisma.$transaction(async tx => {
      let movementId: string | undefined;
      if (input.restockedToInventory && sale.entityType === 'PRODUCT' && sale.entityId) {
        const product = await lockProduct(tx, sale.entityId);
        if (product.stockQuantity !== null) {
          const next = product.stockQuantity + input.quantity;
          const movement = await tx.stockMovement.create({ data: { productId: product.id, storeId: product.storeId, changedByUserId: userId, previousQuantity: product.stockQuantity, newQuantity: next, delta: input.quantity, reason: `RETURN:${sale.id}` } });
          movementId = movement.id;
          await tx.product.update({ where: { id: product.id }, data: { stockQuantity: next, availability: next <= 0 ? 'OUT_OF_STOCK' : next <= 5 ? 'LIMITED' : 'IN_STOCK' } });
        }
      }
      await salesRepository.addReturn(tx, { sale: { connect: { id } }, quantity: input.quantity, refundAmount: input.refundAmount, reason: input.reason, reasonNote: input.reasonNote, restockedToInventory: input.restockedToInventory, ...(movementId ? { stockMovement: { connect: { id: movementId } } } : {}) });
      const refunded = roundMoney(Number(sale.refundedAmount) + input.refundAmount);
      const due = roundMoney(Math.max(Number(sale.totalPrice) - Number(sale.paidAmount) - refunded, 0));
      const status = computeStatus(Number(sale.totalPrice) - refunded, Number(sale.paidAmount), sale.dueDate);
      await tx.saleRecord.update({ where: { id }, data: { refundedAmount: refunded, dueAmount: due, paymentStatus: status } });
      if (sale.customerId) await recomputeCustomer(tx, userId, sale.customerId);
      return salesRepository.findByIdTx(tx, id);
    });
  },

  summary: async (userId: string, period: 'day' | 'week' | 'month' | 'year') => {
    const end = new Date();
    const start = new Date(end);
    if (period === 'day') start.setDate(start.getDate() - 1);
    if (period === 'week') start.setDate(start.getDate() - 7);
    if (period === 'month') start.setMonth(start.getMonth() - 1);
    if (period === 'year') start.setFullYear(start.getFullYear() - 1);
    return salesRepository.summary(userId, start, end);
  },

  chart: async (userId: string, from: Date, to: Date, period: 'day'|'week'|'month'|'year' = 'day') => {
    const rows = await salesRepository.chart(userId, from, to);
    const buckets = new Map<string, { revenue: number; paid: number; due: number; count: number }>();
    const bucketKey = (date: Date) => {
      if (period === 'month') return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
      if (period === 'year') return String(date.getUTCFullYear());
      if (period === 'week') { const d = new Date(date); const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - day + 1); return d.toISOString().slice(0,10); }
      return date.toISOString().slice(0,10);
    };
    for (const row of rows) { const key=bucketKey(row.soldAt); const b=buckets.get(key)??{revenue:0,paid:0,due:0,count:0}; b.revenue += Number(row.totalPrice)-Number(row.refundedAmount); b.paid += Number(row.paidAmount); b.due += Number(row.dueAmount); b.count += 1; buckets.set(key,b); }
    return [...buckets.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(-30).map(([date,values])=>({date,...values}));
  },

  compare: async (userId: string, period: 'week' | 'month' | 'year') => {
    const end = new Date();
    const currentStart = new Date(end);
    if (period === 'week') currentStart.setDate(currentStart.getDate() - 7);
    if (period === 'month') currentStart.setMonth(currentStart.getMonth() - 1);
    if (period === 'year') currentStart.setFullYear(currentStart.getFullYear() - 1);
    const previousStart = new Date(currentStart);
    const previousEnd = new Date(currentStart);
    const span = end.getTime() - currentStart.getTime();
    previousStart.setTime(currentStart.getTime() - span);
    previousEnd.setTime(currentStart.getTime());
    const [current, previous] = await Promise.all([salesRepository.summary(userId, currentStart, end), salesRepository.summary(userId, previousStart, previousEnd)]);
    const percentage = previous.totalRevenue === 0 ? (current.totalRevenue === 0 ? 0 : null) : roundMoney(((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue) * 100);
    return { period, current, previous, revenueChangePercentage: percentage };
  },

  top: (userId: string, limit: number) => Promise.all([salesRepository.topProducts(userId, limit), salesRepository.topCustomers(userId, limit)]),
  debts: (userId: string) => salesRepository.debts(userId),
};
