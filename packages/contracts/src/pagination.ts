import { z } from 'zod';

/**
 * Shared pagination query contract.
 * Mirrors apps/api/src/shared/utils/pagination.ts exactly:
 * page is bounded to 1..1000 and limit to 1..100.
 */
const numericQuery = (max: number) => z
  .string()
  .regex(/^\d+$/)
  .optional()
  .transform((value) => (value === undefined ? undefined : Number(value)))
  .pipe(z.number().int().min(1).max(max).optional());

export const paginationQuerySchema = z.object({
  page: numericQuery(1000),
  limit: numericQuery(100),
});

/**
 * Offset pagination is emitted by buildPaginationMeta; cursor endpoints may
 * additionally emit nextCursor and omit offset-only totals.
 */
export const paginationMetaSchema = z.object({
  page: z.number().int().min(1).max(1000).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  total: z.number().int().min(0).optional(),
  totalPages: z.number().int().min(0).optional(),
  hasNextPage: z.boolean().optional(),
  hasPrevPage: z.boolean().optional(),
  nextCursor: z.string().nullable().optional(),
}).passthrough();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;
