/**
 * FIX AUTH-RESTORE-ERRSHAPE-01
 *
 * Every rejection that comes out of apiClient is a ParsedError
 * ({ message, statusCode, code, ... }) — client.ts's response interceptor
 * runs parseApiError() before rejecting, so the original AxiosError and its
 * `.response` are gone by the time a caller's catch block sees the error.
 * A check for `err.response` is therefore ALWAYS false for apiClient errors,
 * which made "the server answered" indistinguishable from "no answer".
 *
 * This helper reads the HTTP status from either shape (ParsedError.statusCode
 * or a raw AxiosError-like `.response.status`).
 *
 * Only 401/403 are a definitive "this session is gone" answer. 5xx / 429 /
 * 408 / 504 (Railway cold start, deploy, rate limit) are transient and must
 * never sign the user out.
 */
export function getHttpStatus(err: unknown): number {
  if (!err || typeof err !== 'object') return 0;
  const e = err as { statusCode?: unknown; response?: { status?: unknown } | null };
  if (typeof e.statusCode === 'number') return e.statusCode;
  if (typeof e.response?.status === 'number') return e.response.status;
  return 0;
}

export function isDefiniteSessionRejection(err: unknown): boolean {
  const status = getHttpStatus(err);
  return status === 401 || status === 403;
}
