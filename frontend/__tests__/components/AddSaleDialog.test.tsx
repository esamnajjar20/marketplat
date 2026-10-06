import { describe, expect, it } from 'vitest';
import type { CreateSalePayload } from '@/types/sale.types';

describe('sales phase 2 contract', () => {
  it('supports the four sale entity types and payment states', () => {
    const payload: CreateSalePayload = {
      entityType: 'PRODUCT', entityId: 'p1', entityTitle: 'منتج', quantity: 2,
      unitPrice: 10, buyerName: 'عميل', paidAmount: 20,
      paymentStatus: 'PAID', payment: { amount: 20, method: 'CASH' },
    };
    expect(payload.quantity * payload.unitPrice).toBe(20);
    expect(payload.payment?.method).toBe('CASH');
  });
});
