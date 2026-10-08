import type { ParsedError } from '@/lib/errorParser';
import { RETRYABLE_HTTP_STATUSES as RETRYABLE_STATUS_LIST, isRetryableError } from '@/lib/errorPolicy';

export const RETRYABLE_HTTP_STATUSES = new Set(RETRYABLE_STATUS_LIST);
export const MAX_QUERY_RETRIES = 1;
const SAFE_METHODS = new Set(['get', 'head', 'options']);
export const DEFAULT_RETRY_DELAY_MS = 750;
export const MAX_RETRY_DELAY_MS = 15_000;

export function isSafeHttpMethod(method?: string): boolean {
  return SAFE_METHODS.has((method ?? 'get').toLowerCase());
}

export function isRetryableHttpStatus(status?: number): boolean {
  return typeof status === 'number' && (RETRYABLE_HTTP_STATUSES as Set<number>).has(status);
}

export function isRetryableParsedError(error: unknown): boolean {
  const parsed = error as Partial<ParsedError> | null | undefined;
  return isRetryableError(parsed);
}

export function parseRetryAfterMs(value: unknown, now = Date.now()): number | undefined {
  if (value == null) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.max(0, raw * 1000);
  }
  const text = String(raw).trim();
  if (!text) return undefined;
  const seconds = Number(text);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(text);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - now) : undefined;
}

export function getRetryDelayMs(attempt: number, retryAfterMs?: number, random = Math.random()): number {
  if (typeof retryAfterMs === 'number' && Number.isFinite(retryAfterMs)) {
    return Math.min(Math.max(retryAfterMs, 250), MAX_RETRY_DELAY_MS);
  }
  const exponential = DEFAULT_RETRY_DELAY_MS * 2 ** Math.max(0, attempt);
  const jitter = 0.75 + Math.min(0.5, Math.max(0, random)) * 0.5;
  return Math.min(Math.round(exponential * jitter), MAX_RETRY_DELAY_MS);
}

export function getRetryAfterFromParsedError(error: unknown): number | undefined {
  const parsed = error as Partial<ParsedError> | null | undefined;
  const seconds = parsed?.retryAfterSeconds;
  return typeof seconds === 'number' && Number.isFinite(seconds) ? seconds * 1000 : undefined;
}
