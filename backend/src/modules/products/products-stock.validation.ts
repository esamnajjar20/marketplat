import { z } from 'zod';

/** PATCH /products/:id/stock — quick inventory adjust */
export const adjustProductStockSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    /** Absolute quantity (not delta). null clears tracked stock. */
    stockQuantity: z.number().int().min(0).max(1_000_000).nullable(),
    reason: z.string().trim().min(2).max(120).optional(),
  }),
});

export type AdjustProductStockInput = z.infer<typeof adjustProductStockSchema>['body'];

export const stockHistoryQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    productId: z.string().min(1).optional(),
  }),
});

export type StockHistoryQuery = z.infer<typeof stockHistoryQuerySchema>['query'];
