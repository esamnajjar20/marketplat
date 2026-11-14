/**
 * Single entry point for admin client calls to the Next route handlers under
 * `/api/admin/*` (feature flags, gateway registry, debug toggle). These are
 * same-origin Next routes — not the `/api/v1` proxy (use `sameOriginApi`) and
 * not the API origin (use `apiClient`). Do not call `fetch('/api/admin/...')`
 * directly from components.
 *
 * Centralises: same-origin credentials, `cache: 'no-store'`, the JSON
 * content-type when a body is sent, and extra headers (e.g. Authorization).
 * Response parsing and error mapping stay with the caller because each
 * route has its own payload shape.
 */
export interface AdminRouteFetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

export function adminRouteFetch(path: string, opts: AdminRouteFetchOptions = {}): Promise<Response> {
  const hasBody = opts.body !== undefined;
  return fetch(path, {
    method: opts.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...opts.headers,
    },
    ...(hasBody ? { body: JSON.stringify(opts.body) } : {}),
  });
}
