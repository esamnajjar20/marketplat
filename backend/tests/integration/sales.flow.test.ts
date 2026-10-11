import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createTestUser } from '../helpers/auth.helper';
import { createTestSellerProfile } from '../helpers/sellerProfile.helper';
import { createTestStore } from '../helpers/store.helper';

async function createProduct(storeId: string) {
  await prisma.storeType.upsert({
    where: { id: 'st_general' },
    update: {},
    create: {
      id: 'st_general', slug: 'general', nameAr: 'عام', icon: 'Store',
      labels: { products: 'المنتجات' }, presentation: { card: {}, page: {} },
      freeProductLimit: 20, isActive: true, sortOrder: 0,
    },
  });
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const category = await prisma.productCategory.create({
    data: { name: `Test ${unique}`, nameAr: `اختبار ${unique}`, slug: `test-${unique}`, storeTypeId: 'st_general' },
  });
  return prisma.product.create({
    data: { storeId, categoryId: category.id, name: 'Integration Product', description: 'Integration product description', images: [], price: 10, costPrice: 4, stockQuantity: 10 },
  });
}

async function sellerStore() {
  const user = await createTestUser();
  const seller = await createTestSellerProfile(user.id);
  const store = await createTestStore(seller.id);
  return { user, store };
}

describe('Sales integration flow', () => {
  it('creates a product sale, decrements stock, creates invoice and customer stats', async () => {
    const { user, store } = await sellerStore();
    const product = await createProduct(store.id);
    const res = await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${user.accessToken}`).send({
      entityType: 'PRODUCT', entityId: product.id, storeId: store.id, entityTitle: product.name,
      quantity: 2, unitPrice: 10, costPrice: 4, buyerName: 'Ahmed', buyerPhone: '0599111222',
      paidAmount: 20, payment: { amount: 20, method: 'CASH' },
    });
    expect(res.status).toBe(201);
    const saleId = res.body.data.id;
    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const sale = await prisma.saleRecord.findUniqueOrThrow({ where: { id: saleId } });
    const customer = await prisma.customer.findFirstOrThrow({ where: { sellerId: user.id, phone: '0599111222' } });
    expect(fresh.stockQuantity).toBe(8);
    expect(sale.invoiceNumber).toMatch(/^INV-/);
    expect(customer.purchaseCount).toBe(1);
    expect(Number(customer.totalSpent)).toBe(20);
  });


  it('rejects a product sale when requested quantity exceeds available stock', async () => {
    const { user, store } = await sellerStore();
    const product = await createProduct(store.id);
    const res = await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${user.accessToken}`).send({
      entityType: 'PRODUCT', entityId: product.id, storeId: store.id, entityTitle: product.name,
      quantity: 11, unitPrice: 10, buyerName: 'Stock Boundary Buyer', paidAmount: 0,
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code ?? res.body.code).toBe('INSUFFICIENT_STOCK');
    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(fresh.stockQuantity).toBe(10);
    expect(await prisma.saleRecord.count({ where: { sellerId: user.id, buyerName: 'Stock Boundary Buyer' } })).toBe(0);
  });

  it('serializes concurrent payments so the sale cannot be overpaid', async () => {
    const { user } = await sellerStore();
    const created = await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${user.accessToken}`).send({
      entityType: 'FREE', entityTitle: 'Concurrent Payment Sale', quantity: 1, unitPrice: 20,
      buyerName: 'Concurrent Payment Buyer', paidAmount: 0,
    });
    expect(created.status).toBe(201);
    const saleId = created.body.data.id;
    const auth = { Authorization: `Bearer ${user.accessToken}` };
    const attempts = await Promise.all([
      request(app).post(`/api/v1/sales/${saleId}/payments`).set(auth).send({ amount: 15, method: 'CASH' }),
      request(app).post(`/api/v1/sales/${saleId}/payments`).set(auth).send({ amount: 15, method: 'CASH' }),
    ]);
    expect(attempts.filter(r => r.status >= 200 && r.status < 300)).toHaveLength(1);
    expect(attempts.filter(r => r.status === 400)).toHaveLength(1);
    const sale = await prisma.saleRecord.findUniqueOrThrow({ where: { id: saleId }, include: { payments: true } });
    expect(Number(sale.paidAmount)).toBe(15);
    expect(Number(sale.dueAmount)).toBe(5);
    expect(sale.payments).toHaveLength(1);
  });

  it('serializes concurrent returns so returned quantity cannot exceed sold quantity', async () => {
    const { user, store } = await sellerStore();
    const product = await createProduct(store.id);
    const created = await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${user.accessToken}`).send({
      entityType: 'PRODUCT', entityId: product.id, storeId: store.id, entityTitle: product.name,
      quantity: 1, unitPrice: 10, buyerName: 'Concurrent Return Buyer', paidAmount: 10,
      payment: { amount: 10, method: 'CASH' },
    });
    expect(created.status).toBe(201);
    const saleId = created.body.data.id;
    const auth = { Authorization: `Bearer ${user.accessToken}` };
    const payload = { quantity: 1, refundAmount: 10, reason: 'WRONG_ITEM', restockedToInventory: true };
    const attempts = await Promise.all([
      request(app).post(`/api/v1/sales/${saleId}/return`).set(auth).send(payload),
      request(app).post(`/api/v1/sales/${saleId}/return`).set(auth).send(payload),
    ]);
    expect(attempts.filter(r => r.status >= 200 && r.status < 300)).toHaveLength(1);
    expect(attempts.filter(r => r.status === 400)).toHaveLength(1);
    const sale = await prisma.saleRecord.findUniqueOrThrow({ where: { id: saleId }, include: { items: true, returns: true } });
    expect(sale.items[0].returnedQuantity).toBe(1);
    expect(sale.returns).toHaveLength(1);
    expect(Number(sale.refundedAmount)).toBe(10);
  });

  it('records a full return and restores stock/refunded amount', async () => {
    const { user, store } = await sellerStore();
    const product = await createProduct(store.id);
    const created = await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${user.accessToken}`).send({
      entityType: 'PRODUCT', entityId: product.id, storeId: store.id, entityTitle: product.name,
      quantity: 2, unitPrice: 10, buyerName: 'Return Buyer', paidAmount: 20,
      payment: { amount: 20, method: 'CASH' },
    });
    expect(created.status).toBe(201);
    const saleId = created.body.data.id;
    const ret = await request(app).post(`/api/v1/sales/${saleId}/return`).set('Authorization', `Bearer ${user.accessToken}`).send({
      quantity: 2, refundAmount: 20, reason: 'WRONG_ITEM', restockedToInventory: true,
    });
    expect(ret.status).toBe(200);
    const fresh = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    const sale = await prisma.saleRecord.findUniqueOrThrow({ where: { id: saleId }, include: { returns: true } });
    expect(fresh.stockQuantity).toBe(10);
    expect(Number(sale.refundedAmount)).toBe(20);
    expect(sale.returns).toHaveLength(1);
  });

  it('deletes a partially returned sale and restores only the remaining quantity', async () => {
    const { user, store } = await sellerStore();
    const product = await createProduct(store.id);
    const auth = { Authorization: `Bearer ${user.accessToken}` };
    const created = await request(app).post('/api/v1/sales').set(auth).send({
      entityType: 'PRODUCT', entityId: product.id, storeId: store.id, entityTitle: product.name,
      quantity: 3, unitPrice: 10, buyerName: 'Delete After Return Buyer', paidAmount: 30,
      payment: { amount: 30, method: 'CASH' },
    });
    expect(created.status).toBe(201);
    const saleId = created.body.data.id;

    const returned = await request(app).post(`/api/v1/sales/${saleId}/return`).set(auth).send({
      quantity: 1, refundAmount: 10, reason: 'WRONG_ITEM', restockedToInventory: true,
    });
    expect(returned.status).toBe(200);
    const stockAfterReturn = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stockAfterReturn.stockQuantity).toBe(8);

    const deleted = await request(app).delete(`/api/v1/sales/${saleId}`).set(auth);
    expect(deleted.status).toBe(200);
    const stockAfterDelete = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stockAfterDelete.stockQuantity).toBe(10);
    expect(await prisma.saleRecord.findUnique({ where: { id: saleId } })).toBeNull();
  });

  it('creates a multi-product POS sale and decrements each product independently', async () => {
    const { user, store } = await sellerStore();
    const first = await createProduct(store.id);
    const second = await prisma.product.create({ data: { storeId: store.id, categoryId: first.categoryId, name: 'Integration Product 2', description: 'Second product', images: [], price: 7, costPrice: 3, stockQuantity: 5 } });
    const res = await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${user.accessToken}`).send({
      entityType: 'PRODUCT', storeId: store.id, entityTitle: 'POS cart', quantity: 3, unitPrice: 8, buyerName: 'POS Buyer', paidAmount: 23,
      payment: { amount: 23, method: 'CASH' }, items: [
        { productId: first.id, quantity: 2, unitPrice: 8, discount: 1 },
        { productId: second.id, quantity: 1, unitPrice: 8, discount: 0 },
      ],
    });
    expect(res.status).toBe(201);
    const saleId = res.body.data.id;
    const sale = await prisma.saleRecord.findUniqueOrThrow({ where: { id: saleId }, include: { items: true } });
    const firstFresh = await prisma.product.findUniqueOrThrow({ where: { id: first.id } });
    const secondFresh = await prisma.product.findUniqueOrThrow({ where: { id: second.id } });
    expect(sale.items).toHaveLength(2);
    expect(Number(sale.totalPrice)).toBe(23);
    expect(firstFresh.stockQuantity).toBe(8);
    expect(secondFresh.stockQuantity).toBe(4);
  });

  it('persists mixed payments as separate SalePayment rows', async () => {
    const user = await createTestUser();
    const res = await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${user.accessToken}`).send({
      entityType: 'FREE', entityTitle: 'Mixed Sale', quantity: 1, unitPrice: 150,
      buyerName: 'Mixed Buyer', paidAmount: 150,
      payments: [{ amount: 100, method: 'CASH' }, { amount: 50, method: 'JAWWAL_PAY' }],
    });
    expect(res.status).toBe(201);
    const rows = await prisma.salePayment.findMany({ where: { saleId: res.body.data.id }, orderBy: { amount: 'asc' } });
    expect(rows).toHaveLength(2);
    expect(rows.map(r => Number(r.amount))).toEqual([50, 100]);
  });

  it('is idempotent for repeated offline operation ids', async () => {
    const user = await createTestUser();
    const payload = { entityType: 'FREE', entityTitle: 'Offline Sale', quantity: 1, unitPrice: 25, buyerName: 'Offline Buyer', paidAmount: 25, payment: { amount: 25, method: 'CASH' } };
    const op = `test-offline-operation-${Date.now()}`;
    const first = await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${user.accessToken}`).set('X-Offline-Op-Id', op).send(payload);
    const second = await request(app).post('/api/v1/sales').set('Authorization', `Bearer ${user.accessToken}`).set('X-Offline-Op-Id', op).send(payload);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const rows = await prisma.saleRecord.findMany({ where: { sellerId: user.id, offlineOperationId: op } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(first.body.data.id);
  });
});
