/**
 * Generic API response shapes.
 * Mirrors backend src/shared/types/api-response.types.ts
 */

export interface ApiResponse<T = unknown> {
  success:    boolean;
  message:    string;
  data?:      T;
  requestId?: string;
  /**
   * AUDIT-FIX C-2: matches backend's api-response.types.ts exactly —
   * successResponse() always sends `meta` alongside `data` for
   * paginated endpoints (e.g. { pagination: {...} }). This field was
   * previously missing here even though lib/apiPagination.ts and
   * lib/prefetch.ts both read `.meta.pagination` off values typed as
   * ApiResponse<T[]> — a type/reality gap that fails `tsc --noEmit`
   * under this project's strict:true config (no ignoreBuildErrors is
   * set in next.config.ts, so this blocks `next build`).
   */
  meta?:      Record<string, unknown>;
}

export interface PaginationMeta {
  total:       number;
  page:        number;
  limit:       number;
  totalPages:  number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  meta:  PaginationMeta;
}

export interface PaginationParams {
  page?:  number;
  limit?: number;
}

export interface ValidationError {
  field:   string;
  message: string;
}
