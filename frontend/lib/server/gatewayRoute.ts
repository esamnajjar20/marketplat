/**
 * Shared helpers for the same-origin gateway route handlers
 * (app/api/admin/feature-flags, app/api/admin/gateway/registry,
 * app/api/admin/debug-toggle, app/api/public/feature-flags).
 *
 * These helpers used to be copy-pasted into each route file. They were
 * verified to be logically identical before being merged here, so this module
 * is a pure extraction: no behaviour change.
 *
 * Server-only: depends on the Cloudflare runtime context and Next server types.
 */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse, type NextRequest } from 'next/server';
import { getRawApiUrl, getRawServerApiBaseUrl } from '@/lib/env';

export type WorkerBinding = { fetch: (request: Request) => Promise<Response> };
export type BaseRuntimeBindings = { API_WORKER?: WorkerBinding };

export const NO_STORE_HEADERS = { 'cache-control': 'no-store, max-age=0' };

/** Cloudflare runtime bindings; each route passes its own bindings shape as `T`. */
export function runtimeBindings<T extends BaseRuntimeBindings = BaseRuntimeBindings>(): T {
  try {
    return getCloudflareContext().env as unknown as T;
  } catch {
    return {} as T;
  }
}

/** Local-development API origin (never used in production, where the service binding is required). */
export function apiFallbackOrigin(): string | null {
  const configured = getRawServerApiBaseUrl() || getRawApiUrl();
  if (!configured) return process.env.NODE_ENV === 'production' ? null : 'http://localhost:5000';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export async function callApiWorker(
  path: string,
  init: RequestInit,
  bindings: BaseRuntimeBindings,
): Promise<Response> {
  const request = new Request(`https://api${path}`, { ...init, redirect: 'manual' });
  if (bindings.API_WORKER) return bindings.API_WORKER.fetch(request);

  // Local development fallback only. In production, use the configured Service
  // Binding to avoid Worker-to-Worker workers.dev error 1042.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('API_WORKER service binding is unavailable');
  }
  const origin = apiFallbackOrigin();
  if (!origin) throw new Error('API origin is not configured');
  return fetch(new URL(path, origin), { ...init, redirect: 'manual', cache: 'no-store' });
}

/** CSRF-style guard for mutating admin routes: Origin must match and Sec-Fetch-Site must not be cross-site. */
export function isSameOriginMutation(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    if (new URL(origin).origin !== request.nextUrl.origin) return false;
  } catch {
    return false;
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  return !fetchSite || fetchSite === 'same-origin';
}

export function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE_HEADERS });
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Reads an upstream response body with a hard byte cap (declared and streamed). */
export async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maxBytes)) {
    throw new Error('Upstream response exceeded the configured size limit');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error('Upstream response exceeded the configured size limit');
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/**
 * Extracts the upper-cased role from the several response envelopes the API
 * has used for /users/me and /auth/me ({data:{user}}, {user}, {data:{profile}}, ...).
 */
export function roleFromPayload(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  const data = asRecord(root.data);
  const candidates = [data?.user, root.user, data?.profile, data, root];
  for (const candidate of candidates) {
    const role = asRecord(candidate)?.role;
    if (typeof role === 'string') return role.toUpperCase();
  }
  return null;
}
