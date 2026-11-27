import { z } from 'zod';

/** Strictly parse query-string integers and enforce the limits shared by all apps. */
const numericQuery = (max: number) => z.preprocess(
  value => {
    if (value === undefined) return undefined;
    if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
    return Number.NaN;
  },
  z.number().int().min(1).max(max).optional(),
);

export const paginationQuerySchema = z.object({
  page: numericQuery(1000),
  limit: numericQuery(100),
});

/** Offset pagination and cursor metadata are both represented without inventing totals. */
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
