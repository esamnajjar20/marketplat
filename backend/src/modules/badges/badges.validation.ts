import { z } from 'zod';

export const storeIdParamSchema = z.object({
  params: z.object({ storeId: z.string().min(1, 'Store ID is required') }),
});
