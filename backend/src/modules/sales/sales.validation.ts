import { z } from 'zod';
import { SaleEntityType, SalePaymentStatus, SaleTransferMethod, InstallmentStatus, ReturnReason } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

const money = z.coerce.number().finite().nonnegative().multipleOf(0.01);
const positiveMoney = z.coerce.number().finite().positive().multipleOf(0.01);

export const createSaleSchema = z.object({
  body: z.object({
    storeId: z.string().min(1).optional(),
    entityType: z.nativeEnum(SaleEntityType),
    entityId: z.string().min(1).optional(),
    entityTitle: z.string().trim().min(1).max(300),
    entityImageUrl: z.string().url().max(2000).optional().nullable(),
    quantity: z.coerce.number().int().positive().max(1_000_000).default(1),
    unitPrice: money,
    costPrice: money.optional().nullable(),
    currency: z.string().trim().min(3).max(8).default('ILS'),
    customerId: z.string().min(1).optional(),
    buyerName: z.string().trim().min(1).max(160),
    buyerPhone: z.string().trim().max(40).optional().nullable(),
    paymentStatus: z.nativeEnum(SalePaymentStatus).optional(),
    paidAmount: money.default(0),
    dueDate: z.coerce.date().optional().nullable(),
    note: z.string().trim().max(1000).optional().nullable(),
    internalNote: z.string().trim().max(2000).optional().nullable(),
    soldAt: z.coerce.date().optional(),
    serviceRequestId: z.string().min(1).optional(),
    payment: z.object({
      amount: positiveMoney,
      method: z.nativeEnum(SaleTransferMethod),
      transferRef: z.string().trim().max(160).optional(),
      note: z.string().trim().max(500).optional(),
    }).optional(),
    payments: z.array(z.object({
      amount: positiveMoney,
      method: z.nativeEnum(SaleTransferMethod),
      transferRef: z.string().trim().max(160).optional(),
      note: z.string().trim().max(500).optional(),
    })).min(1).max(10).optional(),
    installments: z.array(z.object({
      installmentNo: z.coerce.number().int().positive(),
      amount: positiveMoney,
      dueDate: z.coerce.date(),
      note: z.string().trim().max(500).optional(),
    })).max(60).optional(),
  }).superRefine((data, ctx) => {
    if (data.entityType === 'FREE' && data.entityId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entityId'], message: 'FREE sales cannot have entityId.' });
    }
    if (data.entityType === 'SERVICE' && !data.serviceRequestId && !data.entityId) {
      // A manually recorded service may use entityId; a linked service request is optional.
    }
    const total = Math.round(data.unitPrice * data.quantity * 100) / 100;
    if (data.paidAmount > total) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['paidAmount'], message: 'paidAmount cannot exceed total.' });
    }
    if (data.installments && Math.round(data.installments.reduce((s, x) => s + x.amount, 0) * 100) / 100 > Math.round((total - (data.payment?.amount ?? data.paidAmount)) * 100) / 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['installments'], message: 'Installments cannot exceed the remaining due amount.' });
    }
    if (data.payment && data.paidAmount > 0 && Math.round(data.payment.amount * 100) !== Math.round(data.paidAmount * 100)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payment', 'amount'], message: 'payment.amount must match paidAmount when both are provided.' });
    }
    if (data.payment && data.payment.amount > total) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payment', 'amount'], message: 'Payment cannot exceed total.' });
    }
    if (data.payments) {
      const sum = Math.round(data.payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
      if (sum !== Math.round(data.paidAmount * 100) / 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payments'], message: 'payments total must equal paidAmount.' });
      if (sum > total) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['payments'], message: 'Payments cannot exceed total.' });
    }
  }),
});

export const updateSaleSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    buyerName: z.string().trim().min(1).max(160).optional(),
    buyerPhone: z.string().trim().max(40).nullable().optional(),
    note: z.string().trim().max(1000).nullable().optional(),
    internalNote: z.string().trim().max(2000).nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
    soldAt: z.coerce.date().optional(),
  }).strict(),
});

export const saleIdSchema = z.object({ params: z.object({ id: z.string().min(1) }) });

export const listSalesSchema = z.object({
  query: paginationQuerySchema.extend({
    status: z.nativeEnum(SalePaymentStatus).optional(),
    entityType: z.nativeEnum(SaleEntityType).optional(),
    customerId: z.string().optional(),
    storeId: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }).refine(q => !q.from || !q.to || q.to >= q.from, { message: 'to must be after from' }),
});

export const addPaymentSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    amount: positiveMoney,
    method: z.nativeEnum(SaleTransferMethod),
    transferRef: z.string().trim().max(160).optional(),
    paidAt: z.coerce.date().optional(),
    note: z.string().trim().max(500).optional(),
  }),
});

export const returnSaleSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    quantity: z.coerce.number().int().positive(),
    refundAmount: money,
    reason: z.nativeEnum(ReturnReason),
    reasonNote: z.string().trim().max(500).optional(),
    restockedToInventory: z.boolean().default(true),
  }),
});

export const statsPeriodSchema = z.object({
  query: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    period: z.enum(['day', 'week', 'month', 'year']).default('month'),
  }),
});

export const compareSchema = z.object({
  query: z.object({
    period: z.enum(['week', 'month', 'year']).default('month'),
  }),
});

export const topSchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(50).default(10),
  }),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>['body'];
export type UpdateSaleInput = z.infer<typeof updateSaleSchema>['body'];
export type ListSalesQuery = z.infer<typeof listSalesSchema>['query'];
export type AddPaymentInput = z.infer<typeof addPaymentSchema>['body'];
export type ReturnSaleInput = z.infer<typeof returnSaleSchema>['body'];
