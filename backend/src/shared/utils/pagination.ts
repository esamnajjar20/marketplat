import { z } from 'zod';

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

// INTEG FIX: frontend's types/api.types.ts declares PaginationMeta.hasNextPage
// and .hasPrevPage as required (non-optional) booleans, and lib/apiPagination.ts's
// unwrapPaginated() passes the backend's meta.pagination straight through with
// no defaulting of its own. This function previously only ever built
// { total, page, limit, totalPages } — every response's hasNextPage/hasPrevPage
// was `undefined` at runtime despite the frontend type declaring them as
// always-present booleans. No current UI reads these two fields (Pagination.tsx
// derives isFirst/isLast from totalPages + currentPage instead), so this was a
// silent type-contract violation rather than an observed bug, but any future
// caller trusting the declared type would get `undefined` instead of a real
// boolean. Computed here, once, so all ~14 call sites across every module get
// the fix automatically.
export const buildPaginationMeta = (
  total: number,
  page: number,
  limit: number
): PaginationMeta => {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

// A-06: shared pagination params extractor — eliminates inline skip = (page-1)*limit
interface PaginationInput {
  page?: number;
  limit?: number;
}

interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  take: number;
}

export const getPaginationParams = (
  pageOrInput: number | PaginationInput = 1,
  limit = 20
): PaginationParams => {
  const rawPage = typeof pageOrInput === 'object' ? pageOrInput.page : pageOrInput;
  const rawLimit = typeof pageOrInput === 'object' ? pageOrInput.limit : limit;
  const page = Math.max(1, rawPage ?? 1);
  const normalizedLimit = Math.min(100, Math.max(1, rawLimit ?? 20));

  return {
    page,
    limit: normalizedLimit,
    skip: (page - 1) * normalizedLimit,
    take: normalizedLimit,
  };
};

// A-03: reusable Zod schema for pagination query params
export const paginationQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .transform(Number)
    .pipe(z.number().min(1).max(1000).optional()),
  limit: z
    .string()
    .regex(/^\d+$/)
    .optional()
    .transform(Number)
    .pipe(z.number().min(1).max(100).optional()),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
