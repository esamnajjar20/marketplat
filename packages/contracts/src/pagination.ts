import { z } from 'zod';

/** Shared query primitives only; endpoint-specific bounds should remain explicit. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  total: z.number().int().min(0).optional(),
  totalPages: z.number().int().min(0).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
