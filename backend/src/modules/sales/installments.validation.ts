import { z } from 'zod';
export const installmentIdSchema = z.object({ params: z.object({ id: z.string().min(1) }) });
export const payInstallmentSchema = installmentIdSchema.extend({ body: z.object({ amount: z.coerce.number().positive().multipleOf(0.01) }) });
