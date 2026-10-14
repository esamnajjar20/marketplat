import { salesService } from '../../src/modules/sales/sales.service';
import { salesRepository } from '../../src/modules/sales/sales.repository';
import { invoicesService } from '../../src/modules/sales/invoices.service';
import { requireStoreAccess } from '../../src/modules/stores/store-members.service';
import { prisma } from '../../src/config/prisma';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

jest.mock('../../src/modules/sales/sales.repository');
jest.mock('../../src/modules/sales/invoices.service');
jest.mock('../../src/modules/stores/store-members.service');
jest.mock('../../src/config/prisma', () => ({
  prisma: {
    saleRecord: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    product: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    ad: { findUnique: jest.fn() },
    serviceListing: { findUnique: jest.fn() },
    serviceRequest: { findUnique: jest.fn() },
    user: {
      findUnique: jest.fn().mockResolvedValue({ salesCostTrackingEnabled: false }),
      update: jest.fn(),
    },
    storeDetails: { findFirst: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        saleRecord: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      })
    ),
    $queryRaw: jest.fn().mockResolvedValue([]),
  },
}));

const tx = {
  customer: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  saleRecord: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), aggregate: jest.fn(), delete: jest.fn() },
  stockMovement: { create: jest.fn() },
  product: { update: jest.fn() },
  saleInstallment: { createMany: jest.fn() },
  saleItem: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
  $queryRaw: jest.fn(),
};

const base = {
  entityType: 'FREE' as const,
  entityTitle: 'Manual sale',
  quantity: 2,
  unitPrice: 25,
  buyerName: 'Customer',
  paidAmount: 50,
  currency: 'ILS',
};

describe('salesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));
    (invoicesService.nextInvoiceNumber as jest.Mock).mockResolvedValue('INV-2026-0001');
    (salesRepository.create as jest.Mock).mockResolvedValue({ id: 'sale-1', ...base, sellerId: 'user-1', totalPrice: 50, dueAmount: 0, returns: [], items: [], customerId: null });
    (salesRepository.findByIdTx as jest.Mock).mockResolvedValue({ id: 'sale-1' });
    (tx.saleRecord.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('returns the existing sale for the same offline operation idempotency key', async () => {
    (prisma.saleRecord.findFirst as jest.Mock).mockResolvedValue({ id: 'sale-existing', sellerId: 'user-1', offlineOperationId: 'op-1' });
    (salesRepository.findById as jest.Mock).mockResolvedValue({ id: 'sale-existing' });
    const result = await salesService.create('user-1', base, 'op-1');
    expect(result).toEqual({ id: 'sale-existing' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates a paid free-form sale with a server-generated invoice number', async () => {
    const result = await salesService.create('user-1', base);
    expect(invoicesService.nextInvoiceNumber).toHaveBeenCalled();
    expect(salesRepository.create).toHaveBeenCalledWith(tx, expect.objectContaining({ invoiceNumber: 'INV-2026-0001', totalPrice: 50, paidAmount: 50, dueAmount: 0, paymentStatus: 'PAID' }));
    expect(result).toEqual({ id: 'sale-1' });
  });

  it('requires store management access before associating a free-form sale with a store', async () => {
    (requireStoreAccess as jest.Mock).mockRejectedValue(new Error('store access denied'));

    await expect(salesService.create('user-1', { ...base, storeId: 'other-store' })).rejects.toThrow('store access denied');

    expect(requireStoreAccess).toHaveBeenCalledWith('user-1', 'other-store', 'manageProducts');
    expect(salesRepository.create).not.toHaveBeenCalled();
  });

  it('persists the canonical authorized store id for a free-form sale', async () => {
    (requireStoreAccess as jest.Mock).mockResolvedValue({ kind: 'owner', store: { id: 'canonical-store-id' } });

    await salesService.create('user-1', { ...base, storeId: 'store-slug-or-id' });

    expect(salesRepository.create).toHaveBeenCalledWith(tx, expect.objectContaining({
      store: { connect: { id: 'canonical-store-id' } },
    }));
  });

  it('locks and re-reads a sale before recalculating derived payment fields during edit', async () => {
    const freshSale = {
      id: 'sale-1', sellerId: 'user-1', customerId: null, totalPrice: 100, refundedAmount: 20,
      paidAmount: 30, dueAmount: 50, dueDate: null, items: [],
    };
    (salesRepository.findById as jest.Mock).mockResolvedValue(freshSale);
    (tx.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'sale-1' }]);
    (tx.saleRecord.findUnique as jest.Mock).mockResolvedValue(freshSale);
    (tx.saleRecord.update as jest.Mock).mockResolvedValue({ id: 'sale-1' });
    (salesRepository.findByIdTx as jest.Mock).mockResolvedValue({ id: 'sale-1', buyerName: 'Updated' });

    const result = await salesService.update('user-1', 'sale-1', { buyerName: 'Updated' });

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.saleRecord.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: expect.objectContaining({ buyerName: 'Updated', paymentStatus: 'PARTIAL', dueAmount: 50 }),
    });
    expect(result).toEqual({ id: 'sale-1', buyerName: 'Updated' });
  });

  it('recomputes customer purchase-date aggregates when a sale date is edited', async () => {
    const soldAt = new Date('2026-01-15T12:00:00.000Z');
    const freshSale = {
      id: 'sale-1', sellerId: 'user-1', customerId: 'customer-1', totalPrice: 100,
      refundedAmount: 0, paidAmount: 100, dueAmount: 0, dueDate: null, items: [],
    };
    (salesRepository.findById as jest.Mock).mockResolvedValue(freshSale);
    (tx.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'sale-1' }]);
    (tx.saleRecord.findUnique as jest.Mock).mockResolvedValue(freshSale);
    (tx.saleRecord.aggregate as jest.Mock).mockResolvedValue({
      _sum: { totalPrice: 100, refundedAmount: 0, dueAmount: 0 },
      _count: { _all: 1 },
      _min: { soldAt },
      _max: { soldAt },
    });
    (tx.customer.update as jest.Mock).mockResolvedValue({});
    (tx.saleRecord.update as jest.Mock).mockResolvedValue({ id: 'sale-1' });
    (salesRepository.findByIdTx as jest.Mock).mockResolvedValue({ id: 'sale-1', soldAt });

    await salesService.update('user-1', 'sale-1', { soldAt });

    expect(tx.saleRecord.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: { sellerId: 'user-1', customerId: 'customer-1' },
      _min: { soldAt: true },
      _max: { soldAt: true },
    }));
    expect(tx.customer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-1' },
      data: expect.objectContaining({ firstPurchaseAt: soldAt, lastPurchaseAt: soldAt }),
    }));
    // One lock serializes the sale mutation; the second serializes aggregate refreshes
    // across concurrent mutations of different sales for the same customer.
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });

  it('restores returned quantities on deletion only when they were not already restocked', async () => {
    const sale = {
      id: 'sale-1', sellerId: 'user-1', storeId: null, customerId: null,
      items: [{
        id: 'item-1', entityType: 'PRODUCT', productId: 'product-1',
        quantity: 10, returnedQuantity: 4,
        returns: [
          { quantity: 2, restockedToInventory: true },
          { quantity: 2, restockedToInventory: false },
        ],
      }],
    };
    (salesRepository.findById as jest.Mock).mockResolvedValue(sale);
    (tx.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{ id: 'sale-1' }])
      .mockResolvedValueOnce([{ id: 'product-1', storeId: 'store-1', stockQuantity: 5, status: 'ACTIVE' }]);
    (tx.saleRecord.findUnique as jest.Mock).mockResolvedValue(sale);
    (tx.product.update as jest.Mock).mockResolvedValue({});

    await salesService.remove('user-1', 'sale-1');

    expect(tx.stockMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      productId: 'product-1', previousQuantity: 5, newQuantity: 13, delta: 8,
      reason: 'SALE_DELETE:sale-1:item-1',
    }) });
    expect(tx.product.update).toHaveBeenCalledWith({ where: { id: 'product-1' }, data: expect.objectContaining({ stockQuantity: 13 }) });
    expect(salesRepository.delete).toHaveBeenCalledWith(tx, 'sale-1');
  });

  it('rejects a refund above the proportional value of the returned item quantity', async () => {
    const sale = {
      id: 'sale-1', sellerId: 'user-1', storeId: null, customerId: null,
      totalPrice: 100, refundedAmount: 0, paidAmount: 100, dueDate: null,
      items: [{
        id: 'item-1', entityType: 'FREE', productId: null,
        quantity: 2, returnedQuantity: 0, lineTotal: 100,
        returns: [],
      }],
    };
    (salesRepository.findById as jest.Mock).mockResolvedValue(sale);
    (tx.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'sale-1' }]);
    (tx.saleRecord.findUnique as jest.Mock).mockResolvedValue(sale);

    await expect(salesService.addReturn('user-1', 'sale-1', {
      itemId: 'item-1', quantity: 1, refundAmount: 75,
      reason: 'OTHER', restockedToInventory: false,
    } as any)).rejects.toThrow('Refund exceeds the refundable value of the returned item quantity.');

    expect(salesRepository.addReturn).not.toHaveBeenCalled();
    expect(tx.saleItem.update).not.toHaveBeenCalled();
  });

  it('subtracts previous item refunds when calculating the next quantity refund ceiling', async () => {
    const sale = {
      id: 'sale-1', sellerId: 'user-1', storeId: null, customerId: null,
      totalPrice: 100, refundedAmount: 40, paidAmount: 100, dueDate: null,
      items: [{
        id: 'item-1', entityType: 'FREE', productId: null,
        quantity: 2, returnedQuantity: 1, lineTotal: 100,
        returns: [{ quantity: 1, refundAmount: 40, restockedToInventory: false }],
      }],
    };
    (salesRepository.findById as jest.Mock).mockResolvedValue(sale);
    (tx.$queryRaw as jest.Mock).mockResolvedValue([{ id: 'sale-1' }]);
    (tx.saleRecord.findUnique as jest.Mock).mockResolvedValue(sale);
    (salesRepository.findByIdTx as jest.Mock).mockResolvedValue({ id: 'sale-1' });

    await expect(salesService.addReturn('user-1', 'sale-1', {
      itemId: 'item-1', quantity: 1, refundAmount: 60,
      reason: 'OTHER', restockedToInventory: false,
    } as any)).resolves.toEqual({ id: 'sale-1' });

    expect(salesRepository.addReturn).toHaveBeenCalledWith(tx, expect.objectContaining({
      item: { connect: { id: 'item-1' } }, quantity: 1, refundAmount: 60,
    }));
  });

  it('rejects an unknown product before writing the sale', async () => {
    (prisma.product.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(salesService.create('user-1', { ...base, entityType: 'PRODUCT', entityId: 'missing' })).rejects.toThrow(NotFoundError);
    expect(salesRepository.create).not.toHaveBeenCalled();
  });

  it('rejects a product owned by a different store access path', async () => {
    (prisma.product.findUnique as jest.Mock).mockResolvedValue({ id: 'p1', storeId: 'store-1', status: 'ACTIVE', images: [], price: 10, wholesalePrice: null });
    (requireStoreAccess as jest.Mock).mockRejectedValue(new Error('denied'));
    await expect(salesService.create('user-1', { ...base, entityType: 'PRODUCT', entityId: 'p1' })).rejects.toThrow('denied');
    expect(salesRepository.create).not.toHaveBeenCalled();
  });
});
