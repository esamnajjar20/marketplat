import type { ApiSuccessEnvelope, PaginationMeta as SharedPaginationMeta } from '@marketplat/contracts';

/** Web aliases to the canonical shared API and pagination contracts. */
export type ApiResponse<T = unknown> = ApiSuccessEnvelope<T>;
export type PaginationMeta = SharedPaginationMeta;

export interface PaginatedResponse<T> {
  items: T[];
  meta: PaginationMeta;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface ValidationError {
  field: string;
  message: string;
}
