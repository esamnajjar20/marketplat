import { z } from 'zod';
import { MarketplaceOrderStatus } from '@prisma/client';
import { paginationQuerySchema } from '../../shared/utils/pagination';

export const createMarketplaceOrderSchema = z.object({
  body: z.object({
    items: z.array(z.object({ productId: z.string().trim().min(1).max(100), quantity: z.coerce.number().int().min(1).max(100) })).min(1).max(50),
    recipientName: z.string().trim().min(2).max(160),
    recipientPhone: z.string().trim().min(6).max(40),
    shippingCity: z.string().trim().min(2).max(100),
    shippingAddress: z.string().trim().min(4).max(500),
    buyerNote: z.string().trim().max(1000).optional().nullable(),
    idempotencyKey: z.string().trim().min(8).max(120).optional(),
  }).superRefine((body, ctx) => {
    const ids = body.items.map(item => item.productId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['items'], message: 'Combine duplicate product lines before submitting.' });
  }),
});

export const listMarketplaceOrdersSchema = z.object({
  query: paginationQuerySchema.extend({ status: z.nativeEnum(MarketplaceOrderStatus).optional() }),
});
export const marketplaceOrderIdSchema = z.object({ params: z.object({ id: z.string().trim().min(1).max(100) }) });
export const updateMarketplaceOrderStatusSchema = z.object({
  params: z.object({ id: z.string().trim().min(1).max(100) }),
  body: z.object({ status: z.nativeEnum(MarketplaceOrderStatus), sellerNote: z.string().trim().max(1000).optional().nullable() }),
});
