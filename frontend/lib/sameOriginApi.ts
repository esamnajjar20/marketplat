import { getCsrfToken } from '@/lib/csrf';
import type { ApiResponse } from '@/types/api.types';

/**
 * Single entry point for the few client calls that deliberately go through the
 * same-origin Next proxy (`/api/v1/*`) instead of the Axios `apiClient`
 * (which targets the API origin directly and owns auth refresh + offline queue).
 *
 * Centralises: credentials, the CSRF header on unsafe methods, JSON body,
 * ApiResponse parsing and a uniform error that carries `status`.
 * Do not call `fetch('/api/v1/...')` directly from components.
 */
export class SameOriginApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'SameOriginApiError';
    this.status = status;
  }
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  cache?: RequestCache;
}

export async function sameOriginApi<T>(path: string, opts: Options = {}): Promise<ApiResponse<T>> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const response = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'include',
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(opts.cache ? { cache: opts.cache } : {}),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiResponse<unknown> | null;
    throw new SameOriginApiError(
      payload?.message || `Request failed (${response.status})`,
      response.status,
    );
  }
  return (await response.json()) as ApiResponse<T>;
}
