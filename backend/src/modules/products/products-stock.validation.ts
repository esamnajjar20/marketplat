import { z } from 'zod';

/** PATCH /products/:id/stock — quick inventory adjust */
export const adjustProductStockSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    /** Absolute quantity (not delta). null clears tracked stock. */
    stockQuantity: z.number().int().min(0).max(1_000_000).nullable(),
  }),
});

export type AdjustProductStockInput = z.infer<typeof adjustProductStockSchema>['body'];
