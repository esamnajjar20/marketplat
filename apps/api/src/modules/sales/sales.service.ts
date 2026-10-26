import { prisma } from '../../config/prisma';
import { Prisma, SalePaymentStatus } from '@prisma/client';
import { salesRepository } from './sales.repository';
import { invoicesService } from './invoices.service';
import { notificationsService } from '../notifications/notifications.service';
import { customersService } from '../customers/customers.service';
import { requireStoreAccess } from '../stores/store-members.service';
import {
  CreateSaleInput,
  UpdateSaleInput,
  ListSalesQuery,
  AddPaymentInput,
  ReturnSaleInput,
  UpdateCostSettingsInput,
  UpdateProductCostInput,
} from './sales.validation';
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
  if (input.entityType === 'FREE') {
    // A caller-supplied storeId is still a tenant boundary even for manual
    // (FREE) sales. Resolve and authorize it before persisting the relation;
    // use the canonical store ID returned by the access gate, not raw input.
    const storeId = input.storeId
      ? (await requireStoreAccess(userId, input.storeId, 'manageProducts')).store.id
      : null;
    return { storeId, costPrice: input.costPrice ?? null, imageUrl: input.entityImageUrl ?? null };
  }

  if (!input.entityId)
    throw new BadRequestError(
      'entityId is required for this sale type.',
      'SALE_ENTITY_ID_REQUIRED'
    );

  if (input.entityType === 'PRODUCT') {
    const product = await prisma.product.findUnique({
      where: { id: input.entityId },
      select: {
        id: true,
        name: true,
        images: true,
        price: true,
        wholesalePrice: true,
        costPrice: true,
        storeId: true,
        status: true,
      },
    });
    if (!product || product.status === 'DELETED')
      throw new NotFoundError('Product not found.', 'PRODUCT_NOT_FOUND');
    const access = await requireStoreAccess(userId, product.storeId, 'manageProducts');
    if (input.storeId && input.storeId !== product.storeId)
      throw new BadRequestError(
        'storeId does not match the selected product.',
        'STORE_PRODUCT_MISMATCH'
      );
    return {
      storeId: access.store.id,
      costPrice: input.costPrice ?? (product.costPrice == null ? null : Number(product.costPrice)),
      imageUrl: input.entityImageUrl ?? product.images[0] ?? null,
    };
  }

  if (input.entityType === 'AD') {
    const ad = await prisma.ad.findUnique({
      where: { id: input.entityId },
      select: { id: true, userId: true, storeId: true, title: true, images: true, status: true },
    });
    if (!ad) throw new NotFoundError('Ad not found.', 'AD_NOT_FOUND');
    if (ad.userId !== userId) throw new ForbiddenError('You do not own this ad.', 'NOT_YOUR_AD');
    if (input.storeId && input.storeId !== ad.storeId)
      throw new BadRequestError('storeId does not match the selected ad.', 'STORE_AD_MISMATCH');
    if (ad.storeId) await requireStoreAccess(userId, ad.storeId, 'manageAds');
    return {
      storeId: ad.storeId,
      costPrice: input.costPrice ?? null,
      imageUrl: input.entityImageUrl ?? ad.images[0] ?? null,
    };
  }

  const listing = await prisma.serviceListing.findUnique({
    where: { id: input.entityId },
    include: { provider: { select: { sellerProfile: { select: { userId: true } } } } },
  });
  if (!listing) throw new NotFoundError('Service listing not found.', 'SERVICE_NOT_FOUND');
  if (listing.provider.sellerProfile.userId !== userId)
    throw new ForbiddenError('You do not own this service.', 'NOT_YOUR_SERVICE');
  if (input.serviceRequestId) {
    const request = await prisma.serviceRequest.findUnique({
      where: { id: input.serviceRequestId },
      select: { listingId: true },
    });
    if (!request || request.listingId !== listing.id)
      throw new BadRequestError(
        'serviceRequestId does not belong to the selected service.',
        'SERVICE_REQUEST_MISMATCH'
      );
  }
  if (input.storeId) await requireStoreAccess(userId, input.storeId, 'manageProducts');
  return {
    storeId: input.storeId ?? null,
    costPrice: input.costPrice ?? null,
    imageUrl: input.entityImageUrl ?? listing.images[0] ?? null,
  };
};

const resolveCustomer = async (
  tx: Prisma.TransactionClient,
  sellerId: string,
  input: CreateSaleInput
) => {
  if (input.customerId) {
    const customer = await tx.customer.findFirst({ where: { id: input.customerId, sellerId } });
    if (!customer) throw new NotFoundError('Customer not found.', 'CUSTOMER_NOT_FOUND');
    return customer;
  }
  const phone = customersService.normalizePhone(input.buyerPhone);
  if (!phone) return null;
  const existing = await tx.customer.findFirst({ where: { sellerId, phone } });
  if (existing) return existing;
  return tx.customer.create({
    data: { seller: { connect: { id: sellerId } }, name: input.buyerName, phone, tags: [] },
  });
};

const recomputeCustomer = async (
  tx: Prisma.TransactionClient,
  sellerId: string,
  customerId: string
) => {
  // Serialize aggregate refreshes for a customer, even when concurrent transactions
  // mutate different sales belonging to that same customer. Under READ COMMITTED,
  // the aggregate below then observes transactions that committed while this lock waited.
  const lockedCustomer = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "sales_customers" WHERE "id" = ${customerId} AND "sellerId" = ${sellerId} FOR UPDATE`
  );
  if (!lockedCustomer.length) return;

  // Aggregate in PostgreSQL instead of materializing every historical sale for this customer.
  const aggregate = await tx.saleRecord.aggregate({
    where: { sellerId, customerId },
    _sum: { totalPrice: true, refundedAmount: true, dueAmount: true },
    _count: { _all: true },
    _min: { soldAt: true },
    _max: { soldAt: true },
  });
  const totalSpent =
    Number(aggregate._sum.totalPrice ?? 0) - Number(aggregate._sum.refundedAmount ?? 0);
  const totalDue = Number(aggregate._sum.dueAmount ?? 0);
  await tx.customer.update({
    where: { id: customerId },
    data: {
      totalSpent,
      totalDue,
      purchaseCount: aggregate._count._all,
      firstPurchaseAt: aggregate._min.soldAt,
      lastPurchaseAt: aggregate._max.soldAt,
    },
  });
};

const lockProduct = async (tx: Prisma.TransactionClient, productId: string) => {
  const rows = await tx.$queryRaw<
    Array<{ id: string; storeId: string; stockQuantity: number | null; status: string }>
  >(
    Prisma.sql`SELECT "id", "storeId", "stockQuantity", "status" FROM "products" WHERE "id" = ${productId} FOR UPDATE`
  );
  const product = rows[0];
  if (!product || product.status === 'DELETED')
    throw new NotFoundError('Product not found.', 'PRODUCT_NOT_FOUND');
  return product;
};

// Serialize payment and return mutations for a sale. Reading the sale only after
// acquiring this row lock prevents concurrent requests from validating stale totals.
const lockSaleForUpdate = async (tx: Prisma.TransactionClient, saleId: string) => {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "sale_records" WHERE "id" = ${saleId} FOR UPDATE`
  );
  if (!rows.length) throw new NotFoundError('Sale not found.', 'SALE_NOT_FOUND');
  const sale = await tx.saleRecord.findUnique({
    where: { id: saleId },
    include: {
      items: {
        include: {
          returns: { select: { quantity: true, refundAmount: true, restockedToInventory: true } },
        },
      },
    },
  });
  if (!sale) throw new NotFoundError('Sale not found.', 'SALE_NOT_FOUND');
  return sale;
};

const preparePosItems = async (userId: string, input: CreateSaleInput) => {
  if (!input.items?.length) return null;
  const seen = new Set<string>();
  const prepared = [] as Array<{
    productId: string;
    title: string;
    imageUrl: string | null;
    storeId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    costPrice: number | null;
    lineTotal: number;
  }>;
  let storeId: string | null = null;
  for (const item of input.items) {
    if (seen.has(item.productId))
      throw new BadRequestError(
        'The same product cannot appear twice in a POS cart.',
        'DUPLICATE_POS_PRODUCT'
      );
    seen.add(item.productId);
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
      select: {
        id: true,
        name: true,
        images: true,
        price: true,
        costPrice: true,
        storeId: true,
        status: true,
      },
    });
    if (!product || product.status === 'DELETED')
      throw new NotFoundError('Product not found.', 'PRODUCT_NOT_FOUND');
    await requireStoreAccess(userId, product.storeId, 'manageProducts');
    if (storeId && storeId !== product.storeId)
      throw new BadRequestError(
        'A POS sale must contain products from the same store.',
        'POS_MULTI_STORE_NOT_SUPPORTED'
      );
    storeId = product.storeId;
    const unitPrice = roundMoney(item.unitPrice);
    const discount = roundMoney(item.discount ?? 0);
    const lineTotal = roundMoney(Math.max(unitPrice - discount, 0) * item.quantity);
    prepared.push({
      productId: product.id,
      title: product.name,
      imageUrl: product.images[0] ?? null,
      storeId: product.storeId,
      quantity: item.quantity,
      unitPrice,
      discount,
      costPrice: product.costPrice == null ? null : Number(product.costPrice),
      lineTotal,
    });
  }
  return {
    items: prepared,
    storeId: storeId!,
    total: roundMoney(prepared.reduce((s, item) => s + item.lineTotal, 0)),
    quantity: prepared.reduce((s, item) => s + item.quantity, 0),
  };
};

// Public sales statistics are currently calculated directly by
// modules/sales/public-stats.controller.ts. Do not maintain the legacy
// SalesStatsCache row until a read path is implemented; its former writes were
// write-only, added post-commit database work, and silently swallowed failures.

export const salesService = {
  getCostSettings: async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { salesCostTrackingEnabled: true },
    });
    return { enabled: user?.salesCostTrackingEnabled ?? true };
  },

  updateCostSettings: async (userId: string, input: UpdateCostSettingsInput) => {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { salesCostTrackingEnabled: input.enabled },
      select: { salesCostTrackingEnabled: true },
    });
    return { enabled: user.salesCostTrackingEnabled };
  },

  listCostProducts: async (userId: string) => {
    return prisma.product.findMany({
      where: {
        status: { not: 'DELETED' },
        store: { sellerProfile: { userId } },
      },
      select: {
        id: true,
        storeId: true,
        name: true,
        price: true,
        costPrice: true,
        stockQuantity: true,
        availability: true,
        images: true,
        store: { select: { id: true, name: true } },
      },
      orderBy: [{ updatedAt: 'desc' }, { name: 'asc' }],
    });
  },

  updateProductCost: async (userId: string, productId: string, input: UpdateProductCostInput) => {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, storeId: true },
    });
    if (!product) throw new NotFoundError('Product not found.', 'PRODUCT_NOT_FOUND');
    const store = await prisma.storeDetails.findFirst({
      where: { id: product.storeId, sellerProfile: { userId } },
      select: { id: true },
    });
    if (!store) throw new ForbiddenError('You do not own this product.', 'NOT_YOUR_PRODUCT');
    return prisma.product.update({
      where: { id: productId },
      data: { costPrice: input.costPrice },
      select: {
        id: true,
        storeId: true,
        name: true,
        price: true,
        costPrice: true,
        stockQuantity: true,
        availability: true,
        images: true,
        store: { select: { id: true, name: true } },
      },
    });
  },

  create: async (userId: string, input: CreateSaleInput, offlineOperationId?: string) => {
    if (offlineOperationId) {
      const existing = await prisma.saleRecord.findFirst({
        where: { sellerId: userId, offlineOperationId },
      });
      if (existing) return salesRepository.findById(existing.id);
    }

    const pos = await preparePosItems(userId, input);
    const entity = pos
      ? { storeId: pos.storeId, costPrice: null, imageUrl: pos.items[0]?.imageUrl ?? null }
      : await ensureEntityOwnership(userId, input);
    const costTracking = await salesService.getCostSettings(userId);
    const effectiveCostPrice = costTracking.enabled ? entity.costPrice : null;
    const total = pos?.total ?? roundMoney(input.unitPrice * input.quantity);
    const initialPaid = roundMoney(input.payment?.amount ?? input.paidAmount ?? 0);
    if (initialPaid > total)
      throw new BadRequestError('Paid amount cannot exceed total.', 'PAYMENT_EXCEEDS_TOTAL');

    return prisma
      .$transaction(async tx => {
        const customer = await resolveCustomer(tx, userId, input);
        const invoiceNumber = await invoicesService.nextInvoiceNumber(tx, userId);
        const dueAmount = roundMoney(total - initialPaid);
        const status = computeStatus(total, initialPaid, input.dueDate);
        const saleQuantity = pos?.quantity ?? input.quantity;
        const saleUnitPrice = pos ? roundMoney(total / Math.max(1, saleQuantity)) : input.unitPrice;
        const saleCostPrice =
          pos && costTracking.enabled
            ? (() => {
                const cost = pos.items.reduce(
                  (s, item) => s + (item.costPrice ?? 0) * item.quantity,
                  0
                );
                return saleQuantity ? roundMoney(cost / saleQuantity) : null;
              })()
            : effectiveCostPrice;
        const saleTitle = pos
          ? pos.items.length === 1
            ? pos.items[0].title
            : `${pos.items[0].title} + ${pos.items.length - 1} منتجات`
          : input.entityTitle;

        const sale = await salesRepository.create(tx, {
          seller: { connect: { id: userId } },
          ...(entity.storeId ? { store: { connect: { id: entity.storeId } } } : {}),
          ...(customer ? { customer: { connect: { id: customer.id } } } : {}),
          ...(input.serviceRequestId
            ? { serviceRequest: { connect: { id: input.serviceRequestId } } }
            : {}),
          entityType: input.entityType,
          entityId: pos ? (pos.items.length === 1 ? pos.items[0].productId : null) : input.entityId,
          entityTitle: saleTitle,
          entityImageUrl: entity.imageUrl,
          quantity: saleQuantity,
          unitPrice: saleUnitPrice,
          costPrice: saleCostPrice,
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

        if (pos) {
          // Acquire product row locks in a stable order. Two carts containing the
          // same products in different UI orders would otherwise lock rows in
          // opposite orders and could deadlock under concurrent checkout.
          const itemsForStockMutation = [...pos.items].sort((a, b) =>
            a.productId.localeCompare(b.productId)
          );
          for (const item of itemsForStockMutation) {
            const product = await lockProduct(tx, item.productId);
            if (product.storeId !== item.storeId)
              throw new ConflictError(
                'Product store changed during sale.',
                'PRODUCT_STORE_CHANGED'
              );
            const previous = product.stockQuantity;
            if (previous !== null && item.quantity > previous)
              throw new BadRequestError(
                `Insufficient stock for ${item.title}.`,
                'INSUFFICIENT_STOCK'
              );
            const next = previous === null ? null : previous - item.quantity;
            const movement = await tx.stockMovement.create({
              data: {
                productId: product.id,
                storeId: product.storeId,
                changedByUserId: userId,
                previousQuantity: previous,
                newQuantity: next,
                delta: -item.quantity,
                reason: `SALE:${sale.id}:${item.productId}`,
              },
            });
            await tx.saleItem.create({
              data: {
                saleId: sale.id,
                productId: item.productId,
                entityType: 'PRODUCT',
                entityId: item.productId,
                title: item.title,
                imageUrl: item.imageUrl,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                costPrice: costTracking.enabled ? item.costPrice : null,
                lineTotal: item.lineTotal,
                stockMovementId: movement.id,
              },
            });
            if (next !== null)
              await tx.product.update({
                where: { id: product.id },
                data: {
                  stockQuantity: next,
                  availability: next <= 0 ? 'OUT_OF_STOCK' : next <= 5 ? 'LIMITED' : 'IN_STOCK',
                },
              });
          }
        } else {
          await tx.saleItem.create({
            data: {
              saleId: sale.id,
              productId: input.entityType === 'PRODUCT' ? input.entityId ?? null : null,
              entityType: input.entityType,
              entityId: input.entityId ?? null,
              title: input.entityTitle,
              imageUrl: entity.imageUrl,
              quantity: input.quantity,
              unitPrice: input.unitPrice,
              costPrice: effectiveCostPrice,
              lineTotal: total,
              stockMovementId: null,
            },
          });
        }

        if (input.payments?.length) {
          const paymentTotal = roundMoney(
            input.payments.reduce((sum, payment) => sum + payment.amount, 0)
          );
          if (paymentTotal !== initialPaid)
            throw new BadRequestError(
              'Payment methods total must equal paidAmount.',
              'PAYMENTS_TOTAL_MISMATCH'
            );
          for (const payment of input.payments)
            await salesRepository.addPayment(tx, {
              sale: { connect: { id: sale.id } },
              amount: payment.amount,
              method: payment.method,
              transferRef: payment.transferRef,
              note: payment.note,
            });
        } else if (input.payment && initialPaid > 0) {
          await salesRepository.addPayment(tx, {
            sale: { connect: { id: sale.id } },
            amount: initialPaid,
            method: input.payment.method,
            transferRef: input.payment.transferRef,
            note: input.payment.note,
          });
        }

        if (input.installments?.length) {
          const seen = new Set<number>();
          for (const installment of input.installments) {
            if (seen.has(installment.installmentNo))
              throw new BadRequestError(
                'Duplicate installment number.',
                'DUPLICATE_INSTALLMENT_NO'
              );
            seen.add(installment.installmentNo);
          }
          await tx.saleInstallment.createMany({
            data: input.installments.map(i => ({
              saleId: sale.id,
              installmentNo: i.installmentNo,
              amount: i.amount,
              dueDate: i.dueDate,
              note: i.note,
            })),
          });
        }

        if (!pos && input.entityType === 'PRODUCT' && input.entityId) {
          const product = await lockProduct(tx, input.entityId);
          if (product.storeId !== entity.storeId)
            throw new ConflictError('Product store changed during sale.', 'PRODUCT_STORE_CHANGED');
          const previous = product.stockQuantity;
          if (previous !== null && input.quantity > previous) {
            throw new BadRequestError('Insufficient stock for this product.', 'INSUFFICIENT_STOCK');
          }
          const next = previous === null ? null : previous - input.quantity;
          const movement = await tx.stockMovement.create({
            data: {
              productId: product.id,
              storeId: product.storeId,
              changedByUserId: userId,
              previousQuantity: previous,
              newQuantity: next,
              delta: -input.quantity,
              reason: `SALE:${sale.id}`,
            },
          });
          await tx.saleRecord.update({
            where: { id: sale.id },
            data: { stockMovementId: movement.id },
          });
          await tx.saleItem.updateMany({
            where: { saleId: sale.id },
            data: { stockMovementId: movement.id },
          });
          if (next !== null)
            await tx.product.update({
              where: { id: product.id },
              data: {
                stockQuantity: next,
                availability: next <= 0 ? 'OUT_OF_STOCK' : next <= 5 ? 'LIMITED' : 'IN_STOCK',
              },
            });
        }

        if (customer) await recomputeCustomer(tx, userId, customer.id);
        return salesRepository.findByIdTx(tx, sale.id);
      })
      .catch(async error => {
        if (
          offlineOperationId &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const existing = await prisma.saleRecord.findFirst({
            where: { sellerId: userId, offlineOperationId },
          });
          if (existing) return salesRepository.findById(existing.id);
        }
        throw error;
      });
  },
  list: (userId: string, query: ListSalesQuery) => salesRepository.findForSeller(userId, query),

  getById: async (userId: string, id: string) => {
    const sale = await salesRepository.findById(id);
    if (!sale || sale.sellerId !== userId)
      throw new NotFoundError('Sale not found.', 'SALE_NOT_FOUND');
    return sale;
  },

  update: async (userId: string, id: string, input: UpdateSaleInput) => {
    // Serialize edits with payments, returns and deletion. Computing derived
    // payment fields from a pre-transaction snapshot could otherwise overwrite
    // a payment/return committed while this edit was waiting to write.
    await salesService.getById(userId, id); // preserve the usual not-found path
    return prisma.$transaction(async tx => {
      const sale = await lockSaleForUpdate(tx, id);
      if (sale.sellerId !== userId) throw new NotFoundError('Sale not found.', 'SALE_NOT_FOUND');
      const dueDate = input.dueDate === undefined ? sale.dueDate : input.dueDate;
      const netTotal = Number(sale.totalPrice) - Number(sale.refundedAmount);
      await tx.saleRecord.update({
        where: { id: sale.id },
        data: {
          ...input,
          paymentStatus: computeStatus(netTotal, Number(sale.paidAmount), dueDate),
          dueAmount: roundMoney(Math.max(netTotal - Number(sale.paidAmount), 0)),
        },
      });
      // Customer purchase boundaries are derived from soldAt. If a sale date
      // is edited, recompute these aggregates in the same transaction so the
      // customer's first/last purchase dates cannot remain stale.
      if (sale.customerId && input.soldAt !== undefined) {
        await recomputeCustomer(tx, userId, sale.customerId);
      }
      return salesRepository.findByIdTx(tx, sale.id);
    });
  },

  remove: async (userId: string, id: string) => {
    // Keep the pre-transaction lookup for the usual authorization/error path,
    // then re-read under the sale row lock to serialize deletion with payments
    // and returns. All these operations lock the sale before any product row.
    await salesService.getById(userId, id);
    await prisma.$transaction(async tx => {
      const sale = await lockSaleForUpdate(tx, id);
      if (sale.sellerId !== userId) throw new NotFoundError('Sale not found.', 'SALE_NOT_FOUND');
      for (const item of sale.items) {
        if (item.entityType !== 'PRODUCT' || !item.productId) continue;
        const product = await lockProduct(tx, item.productId);
        // A returned quantity may already have been added back to inventory, but
        // returns marked restockedToInventory=false were never restored. On sale
        // deletion, restore every sold unit except units already restocked by a
        // return, rather than subtracting all returned quantities blindly.
        const alreadyRestocked = (item.returns ?? []).reduce(
          (sum, returned) => sum + (returned.restockedToInventory ? returned.quantity : 0),
          0
        );
        const restoreQty = Math.max(item.quantity - alreadyRestocked, 0);
        if (product.stockQuantity !== null && restoreQty > 0) {
          const next = product.stockQuantity + restoreQty;
          await tx.stockMovement.create({
            data: {
              productId: product.id,
              storeId: product.storeId,
              changedByUserId: userId,
              previousQuantity: product.stockQuantity,
              newQuantity: next,
              delta: restoreQty,
              reason: `SALE_DELETE:${sale.id}:${item.id}`,
            },
          });
          await tx.product.update({
            where: { id: product.id },
            data: {
              stockQuantity: next,
              availability: next <= 0 ? 'OUT_OF_STOCK' : next <= 5 ? 'LIMITED' : 'IN_STOCK',
            },
          });
        }
      }
      await salesRepository.delete(tx, sale.id);
      if (sale.customerId) await recomputeCustomer(tx, userId, sale.customerId);
    });
  },

  addPayment: async (userId: string, id: string, input: AddPaymentInput) => {
    await salesService.getById(userId, id); // authorization check before entering the transaction
    return prisma.$transaction(async tx => {
      const sale = await lockSaleForUpdate(tx, id);
      if (sale.sellerId !== userId) throw new NotFoundError('Sale not found.', 'SALE_NOT_FOUND');
      if (input.amount > Number(sale.dueAmount))
        throw new BadRequestError(
          'Payment exceeds the remaining due amount.',
          'PAYMENT_EXCEEDS_DUE'
        );
      await salesRepository.addPayment(tx, {
        sale: { connect: { id } },
        amount: input.amount,
        method: input.method,
        transferRef: input.transferRef,
        paidAt: input.paidAt,
        note: input.note,
      });
      const paid = roundMoney(Number(sale.paidAmount) + input.amount);
      const due = roundMoney(
        Math.max(Number(sale.totalPrice) - Number(sale.refundedAmount) - paid, 0)
      );
      const status = computeStatus(
        Number(sale.totalPrice) - Number(sale.refundedAmount),
        paid,
        sale.dueDate
      );
      await tx.saleRecord.update({
        where: { id },
        data: { paidAmount: paid, dueAmount: due, paymentStatus: status },
      });
      if (sale.customerId) await recomputeCustomer(tx, userId, sale.customerId);
      return salesRepository.findByIdTx(tx, id);
    });
  },

  addReturn: async (userId: string, id: string, input: ReturnSaleInput) => {
    await salesService.getById(userId, id); // authorization check before entering the transaction
    return prisma.$transaction(async tx => {
      const sale = await lockSaleForUpdate(tx, id);
      if (sale.sellerId !== userId) throw new NotFoundError('Sale not found.', 'SALE_NOT_FOUND');
      const item = input.itemId
        ? sale.items.find(i => i.id === input.itemId)
        : sale.items.length === 1
          ? sale.items[0]
          : null;
      if (!item)
        throw new BadRequestError(
          'itemId is required when returning from a multi-item sale.',
          'RETURN_ITEM_REQUIRED'
        );
      if (item.returnedQuantity + input.quantity > item.quantity)
        throw new BadRequestError(
          'Returned quantity exceeds sold quantity.',
          'RETURN_QUANTITY_EXCEEDED'
        );
      const remainingRefundable = roundMoney(Number(sale.totalPrice) - Number(sale.refundedAmount));
      if (input.refundAmount > remainingRefundable)
        throw new BadRequestError(
          'Refund exceeds the remaining sale value.',
          'REFUND_EXCEEDS_SALE'
        );

      // Bound refunds by the sold value of the quantity being returned, not only
      // by the remaining total sale value. Use lineTotal so POS discounts are
      // respected. The cumulative ceiling grows with cumulative returned units,
      // preventing a single-unit return from refunding the whole multi-unit line.
      const priorItemRefunds = roundMoney(
        (item.returns ?? []).reduce((sum, returned) => sum + Number(returned.refundAmount ?? 0), 0)
      );
      const cumulativeReturnedQuantity = item.returnedQuantity + input.quantity;
      const cumulativeItemRefundCeiling = roundMoney(
        (Number(item.lineTotal) * cumulativeReturnedQuantity) / item.quantity
      );
      const remainingItemRefundable = roundMoney(
        Math.max(cumulativeItemRefundCeiling - priorItemRefunds, 0)
      );
      if (input.refundAmount > remainingItemRefundable) {
        throw new BadRequestError(
          'Refund exceeds the refundable value of the returned item quantity.',
          'REFUND_EXCEEDS_ITEM_VALUE'
        );
      }

      let movementId: string | undefined;
      if (input.restockedToInventory && item.entityType === 'PRODUCT' && item.productId) {
        const product = await lockProduct(tx, item.productId);
        if (product.stockQuantity !== null) {
          const next = product.stockQuantity + input.quantity;
          const movement = await tx.stockMovement.create({
            data: {
              productId: product.id,
              storeId: product.storeId,
              changedByUserId: userId,
              previousQuantity: product.stockQuantity,
              newQuantity: next,
              delta: input.quantity,
              reason: `RETURN:${sale.id}:${item.id}`,
            },
          });
          movementId = movement.id;
          await tx.product.update({
            where: { id: product.id },
            data: {
              stockQuantity: next,
              availability: next <= 0 ? 'OUT_OF_STOCK' : next <= 5 ? 'LIMITED' : 'IN_STOCK',
            },
          });
        }
      }
      await salesRepository.addReturn(tx, {
        sale: { connect: { id } },
        item: { connect: { id: item.id } },
        quantity: input.quantity,
        refundAmount: input.refundAmount,
        reason: input.reason,
        reasonNote: input.reasonNote,
        restockedToInventory: input.restockedToInventory,
        ...(movementId ? { stockMovement: { connect: { id: movementId } } } : {}),
      });
      await tx.saleItem.update({
        where: { id: item.id },
        data: { returnedQuantity: { increment: input.quantity } },
      });
      const refunded = roundMoney(Number(sale.refundedAmount) + input.refundAmount);
      const due = roundMoney(
        Math.max(Number(sale.totalPrice) - Number(sale.paidAmount) - refunded, 0)
      );
      const status = computeStatus(
        Number(sale.totalPrice) - refunded,
        Number(sale.paidAmount),
        sale.dueDate
      );
      await tx.saleRecord.update({
        where: { id },
        data: { refundedAmount: refunded, dueAmount: due, paymentStatus: status },
      });
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

  chart: async (
    userId: string,
    from: Date,
    to: Date,
    period: 'day' | 'week' | 'month' | 'year' = 'day'
  ) => {
    const rows = await salesRepository.chart(userId, from, to, period);
    // The repository returns one row per UTC bucket, with totals computed by PostgreSQL.
    return rows.slice(-30).map(row => ({
      date:
        period === 'year'
          ? String(row.date.getUTCFullYear())
          : period === 'month'
            ? `${row.date.getUTCFullYear()}-${String(row.date.getUTCMonth() + 1).padStart(2, '0')}`
            : row.date.toISOString().slice(0, 10),
      revenue: roundMoney(Number(row.revenue)),
      paid: roundMoney(Number(row.paid)),
      due: roundMoney(Number(row.due)),
      count: Number(row.count),
    }));
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
    const [current, previous] = await Promise.all([
      salesRepository.summary(userId, currentStart, end),
      salesRepository.summary(userId, previousStart, previousEnd),
    ]);
    const percentage =
      previous.totalRevenue === 0
        ? current.totalRevenue === 0
          ? 0
          : null
        : roundMoney(
            ((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue) * 100
          );
    return { period, current, previous, revenueChangePercentage: percentage };
  },

  top: (userId: string, limit: number) =>
    Promise.all([
      salesRepository.topProducts(userId, limit),
      salesRepository.topCustomers(userId, limit),
    ]),
  dashboard: async (userId: string) => {
    const [summary, compare, debt, top, lowStock] = await Promise.all([
      salesService.summary(userId, 'month'),
      salesService.compare(userId, 'month'),
      salesService.debtSummary(userId),
      salesService.top(userId, 5),
      prisma.product.findMany({
        where: {
          status: { not: 'DELETED' },
          stockQuantity: { lte: 5 },
          store: { sellerProfile: { userId } },
        },
        select: {
          id: true,
          name: true,
          stockQuantity: true,
          price: true,
          store: { select: { id: true, name: true } },
        },
        orderBy: { stockQuantity: 'asc' },
        take: 10,
      }),
    ]);
    return { summary, compare, debt, topProducts: top[0], topCustomers: top[1], lowStock };
  },
  report: async (userId: string, query: import('./sales.validation').ReportQuery) => {
    const where: Prisma.SaleRecordWhereInput = {
      sellerId: userId,
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.status ? { paymentStatus: query.status } : {}),
      ...(query.from || query.to
        ? {
            soldAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };
    const [sales, totalCount] = await Promise.all([
      prisma.saleRecord.findMany({
        where,
        orderBy: [{ soldAt: 'desc' }, { id: 'desc' }],
        take: query.limit,
        select: {
          id: true,
          invoiceNumber: true,
          soldAt: true,
          buyerName: true,
          buyerPhone: true,
          entityTitle: true,
          totalPrice: true,
          refundedAmount: true,
          paidAmount: true,
          dueAmount: true,
          paymentStatus: true,
          currency: true,
          store: { select: { name: true } },
          items: {
            select: {
              title: true,
              quantity: true,
              returnedQuantity: true,
              unitPrice: true,
              lineTotal: true,
              costPrice: true,
            },
          },
        },
      }),
      prisma.saleRecord.count({ where }),
    ]);
    const rows = sales.map(sale => {
      const cost = sale.items.reduce(
        (sum, item) =>
          sum +
          (item.costPrice === null
            ? 0
            : Number(item.costPrice) * Math.max(item.quantity - item.returnedQuantity, 0)),
        0
      );
      const revenue = Number(sale.totalPrice) - Number(sale.refundedAmount);
      return {
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        soldAt: sale.soldAt,
        buyerName: sale.buyerName,
        buyerPhone: sale.buyerPhone,
        storeName: sale.store?.name ?? null,
        title: sale.entityTitle,
        quantity: sale.items.reduce(
          (sum, item) => sum + Math.max(item.quantity - item.returnedQuantity, 0),
          0
        ),
        revenue: roundMoney(revenue),
        cost: roundMoney(cost),
        profit: roundMoney(revenue - cost),
        paid: roundMoney(Number(sale.paidAmount)),
        due: roundMoney(Number(sale.dueAmount)),
        refunded: roundMoney(Number(sale.refundedAmount)),
        status: sale.paymentStatus,
        currency: sale.currency,
      };
    });
    return {
      rows,
      count: rows.length,
      totalCount,
      hasMore: totalCount > rows.length,
      totals: rows.reduce(
        (a, r) => ({
          revenue: roundMoney(a.revenue + r.revenue),
          cost: roundMoney(a.cost + r.cost),
          profit: roundMoney(a.profit + r.profit),
          paid: roundMoney(a.paid + r.paid),
          due: roundMoney(a.due + r.due),
          refunded: roundMoney(a.refunded + r.refunded),
        }),
        { revenue: 0, cost: 0, profit: 0, paid: 0, due: 0, refunded: 0 }
      ),
    };
  },
  debtSummary: async (userId: string) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const baseWhere: Prisma.SaleRecordWhereInput = {
      sellerId: userId,
      dueAmount: { gt: 0 },
      paymentStatus: { in: ['PARTIAL', 'UNPAID', 'OVERDUE'] },
    };
    // Compute all debt KPIs in one database round-trip instead of three aggregates.
    // Keep the same base filters and date boundaries as the Prisma aggregates above.
    const [summary] = await prisma.$queryRaw<
      Array<{
        totalDue: Prisma.Decimal | number | string | null;
        overdueDue: Prisma.Decimal | number | string | null;
        dueToday: Prisma.Decimal | number | string | null;
        debtorCount: bigint;
      }>
    >`
      SELECT
        COALESCE(SUM("dueAmount"), 0) AS "totalDue",
        COALESCE(SUM("dueAmount") FILTER (WHERE "dueDate" < ${now}), 0) AS "overdueDue",
        COALESCE(SUM("dueAmount") FILTER (
          WHERE "dueDate" >= ${todayStart} AND "dueDate" < ${tomorrowStart}
        ), 0) AS "dueToday",
        COUNT(*) AS "debtorCount"
      FROM "sale_records"
      WHERE "sellerId" = ${userId}
        AND "dueAmount" > 0
        AND "paymentStatus"::text IN ('PARTIAL', 'UNPAID', 'OVERDUE')
    `;
    return {
      totalDue: roundMoney(Number(summary?.totalDue ?? 0)),
      overdueDue: roundMoney(Number(summary?.overdueDue ?? 0)),
      dueToday: roundMoney(Number(summary?.dueToday ?? 0)),
      debtorCount: Number(summary?.debtorCount ?? 0),
    };
  },
  debts: (userId: string, page = 1, limit = 20) => salesRepository.debts(userId, page, limit),
};
