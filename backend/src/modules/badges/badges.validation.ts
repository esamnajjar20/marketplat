import { z } from 'zod';

export const storeIdParamSchema = z.object({
  params: z.object({ storeId: z.string().min(1, 'Store ID is required') }),
});

export const providerIdParamSchema = z.object({
  params: z.object({ providerId: z.string().min(1, 'Provider ID is required') }),
});
