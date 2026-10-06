import { salesService } from '../../src/modules/sales/sales.service';
import { salesRepository } from '../../src/modules/sales/sales.repository';
import { invoicesService } from '../../src/modules/sales/invoices.service';
import { requireStoreAccess } from '../../src/modules/stores/store-members.service';
import { prisma } from '../../src/config/prisma';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

jest.mock('../../src/modules/sales/sales.repository');
jest.mock('../../src/modules/sales/invoices.service');
jest.mock('../../src/modules/stores/store-members.service');
jest.mock('../../src/config/prisma', () => ({ prisma: { product: { findUnique: jest.fn() }, ad: { findUnique: jest.fn() }, serviceListing: { findUnique: jest.fn() }, $transaction: jest.fn() } }));

const tx = {
  customer: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  saleRecord: { update: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
  stockMovement: { create: jest.fn() },
  product: { update: jest.fn() },
  saleInstallment: { createMany: jest.fn() },
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
    (salesRepository.create as jest.Mock).mockResolvedValue({ id: 'sale-1', ...base, sellerId: 'user-1', totalPrice: 50, dueAmount: 0, returns: [], customerId: null });
    (salesRepository.findByIdTx as jest.Mock).mockResolvedValue({ id: 'sale-1' });
    (tx.saleRecord.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('creates a paid free-form sale with a server-generated invoice number', async () => {
    const result = await salesService.create('user-1', base);
    expect(invoicesService.nextInvoiceNumber).toHaveBeenCalled();
    expect(salesRepository.create).toHaveBeenCalledWith(tx, expect.objectContaining({ invoiceNumber: 'INV-2026-0001', totalPrice: 50, paidAmount: 50, dueAmount: 0, paymentStatus: 'PAID' }));
    expect(result).toEqual({ id: 'sale-1' });
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
