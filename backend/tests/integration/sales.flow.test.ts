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
