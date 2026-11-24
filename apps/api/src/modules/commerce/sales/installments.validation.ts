import { z } from 'zod';
import { SaleTransferMethod } from '@prisma/client';
export const installmentIdSchema = z.object({ params: z.object({ id: z.string().min(1) }) });
export const payInstallmentSchema = installmentIdSchema.extend({
  body: z.object({
    amount: z.coerce.number().finite().positive().max(99_999_999.99).multipleOf(0.01),
    offlineOperationId: z.string().trim().min(8).max(128).optional(),
    method: z.nativeEnum(SaleTransferMethod).default('OTHER'),
    transferRef: z.string().trim().max(160).optional(),
  }),
});
