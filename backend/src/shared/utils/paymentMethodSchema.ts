import { z } from 'zod';

// FIX: this exact schema (id/kind/label/accountName/accountNumber) was
// independently duplicated in stores.validation.ts and
// sellers.validation.ts — same shape as optionalQueryNumber's original
// 16-copy problem in queryHelpers.ts, just at n=2. Any future payment
// kind (e.g. adding a new provider to the enum) would need to be
// hand-applied to both copies to actually take effect everywhere.
// Centralized here instead; both modules now import this.
export const storePaymentMethodSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(['jawwal', 'palpay', 'bank', 'custom']),
  label: z.string().min(1).max(80),
  accountName: z.string().min(1).max(100),
  accountNumber: z.string().min(3).max(40),
});

export type StorePaymentMethodInput = z.infer<typeof storePaymentMethodSchema>;
