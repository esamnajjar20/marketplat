import type { ParsedError } from '@/lib/errorParser';

/** Single frontend policy for interpreting the normalized API error contract. */
export const RETRYABLE_HTTP_STATUSES = [408, 425, 429, 502, 503, 504] as const;

export function isNetworkError(error: Partial<ParsedError> | null | undefined): boolean {
  return error?.statusCode === 0 || error?.code === 'NETWORK_ERROR' || error?.code === 'ERR_NETWORK';
}

export function isRetryableStatus(statusCode: number | undefined): boolean {
  return typeof statusCode === 'number' && (RETRYABLE_HTTP_STATUSES as readonly number[]).includes(statusCode);
}

export function isRetryableError(error: Partial<ParsedError> | null | undefined): boolean {
  return isNetworkError(error) || isRetryableStatus(error?.statusCode);
}

export function isServerError(statusCode: number | undefined): boolean {
  return typeof statusCode === 'number' && statusCode >= 500 && statusCode <= 599;
}

export type ErrorPresentationKind =
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'rate-limit'
  | 'service-unavailable'
  | 'server'
  | 'client'
  | 'unknown';

export function classifyError(error: Partial<ParsedError> | null | undefined): ErrorPresentationKind {
  const status = error?.statusCode;
  if (isNetworkError(error)) return 'network';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate-limit';
  if (status === 503) return 'service-unavailable';
  if (isServerError(status)) return 'server';
  if (typeof status === 'number' && status >= 400 && status <= 499) return 'client';
  return 'unknown';
}
