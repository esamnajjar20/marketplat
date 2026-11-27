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

/** Offset metadata always has totals and page navigation. */
export interface OffsetPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/** Cursor pagination intentionally has no fabricated total/page number. */
export interface CursorPaginationMeta {
  limit: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

/** Runtime shape for endpoints using page/limit offset pagination. */
export const offsetPaginationMetaSchema = z.object({
  total: z.number().int().min(0),
  page: z.number().int().min(1).max(1000),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().min(0),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
}).passthrough();

/** Runtime shape for endpoints using cursor pagination. */
export const cursorPaginationMetaSchema = z.object({
  limit: z.number().int().min(1).max(100),
  hasNextPage: z.boolean(),
  nextCursor: z.string().nullable(),
}).passthrough();

/** Partial wire-compatible metadata for endpoints that expose either strategy. */
export interface PaginationMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
  nextCursor?: string | null;
}

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
