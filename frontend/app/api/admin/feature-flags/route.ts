import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type WorkerBinding = { fetch: (request: Request) => Promise<Response> };
type RuntimeBindings = {
  API_WORKER?: WorkerBinding;
  FEATURE_FLAGS_ADMIN_TOKEN?: string;
};

const NO_STORE_HEADERS = { 'cache-control': 'no-store, max-age=0' };

function runtimeBindings(): RuntimeBindings {
  try {
    return getCloudflareContext().env as unknown as RuntimeBindings;
  } catch {
    return {};
  }
}

function apiFallbackOrigin(): string | null {
  const configured = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!configured) return process.env.NODE_ENV === 'production' ? null : 'http://localhost:5000';
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

async function callApiWorker(path: string, init: RequestInit, bindings: RuntimeBindings): Promise<Response> {
  const request = new Request(`https://api${path}`, { ...init, redirect: 'manual' });
  if (bindings.API_WORKER) return bindings.API_WORKER.fetch(request);
  if (process.env.NODE_ENV === 'production') throw new Error('API_WORKER service binding is unavailable');
  const origin = apiFallbackOrigin();
  if (!origin) throw new Error('API origin is not configured');
  return fetch(new URL(path, origin), { ...init, redirect: 'manual', cache: 'no-store' });
}

function isSameOriginMutation(request: NextRequest): boolean {
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

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status, headers: NO_STORE_HEADERS });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function roleFromPayload(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  const data = asRecord(root.data);
  const candidates = [data?.user, root.user, data?.profile, data, root];
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (typeof record?.role === 'string') return record.role.toUpperCase();
  }
  return null;
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
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

async function verifySuperAdminSession(request: NextRequest, bindings: RuntimeBindings): Promise<boolean> {
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (!cookie && !authorization) return false;
  const headers = new Headers({ accept: 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);
  try {
    const response = await callApiWorker('/api/v1/users/me', {
      method: 'GET', headers, cache: 'no-store', signal: AbortSignal.timeout(5_000),
    }, bindings);
    if (!response.ok) return false;
    const payload: unknown = JSON.parse(await readLimitedText(response, 16_384));
    return roleFromPayload(payload) === 'SUPER_ADMIN';
  } catch {
    return false;
  }
}

async function readLimitedJsonBody(request: NextRequest): Promise<string | null> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') return null;
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > 4096)) return null;
  if (!request.body) return null;
  try {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 4096) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const payload: unknown = JSON.parse(text);
    const body = asRecord(payload);
    if (!body || typeof body.name !== 'string' || !/^[A-Z][A-Z0-9_]{0,63}$/.test(body.name) || typeof body.enabled !== 'boolean') return null;
    if (body.rolloutPercent !== undefined && (!Number.isInteger(body.rolloutPercent) || Number(body.rolloutPercent) < 0 || Number(body.rolloutPercent) > 100)) return null;
    return JSON.stringify({ name: body.name, enabled: body.enabled, rolloutPercent: body.rolloutPercent === undefined ? 100 : Number(body.rolloutPercent) });
  } catch {
    return null;
  }
}

async function proxy(request: NextRequest, method: 'GET' | 'PUT') {
  const bindings = runtimeBindings();
  if (method === 'PUT' && !isSameOriginMutation(request)) return jsonError('CSRF_REJECTED', 403);
  if (!(await verifySuperAdminSession(request, bindings))) return jsonError('SUPER_ADMIN_REQUIRED', 403);

  const secret = bindings.FEATURE_FLAGS_ADMIN_TOKEN || process.env.FEATURE_FLAGS_ADMIN_TOKEN;
  if (!secret || secret.length < 32) return jsonError('FEATURE_FLAGS_ADMIN_TOKEN_NOT_CONFIGURED_ON_FRONTEND', 503);

  let body: string | undefined;
  if (method === 'PUT') {
    const parsed = await readLimitedJsonBody(request);
    if (!parsed) return jsonError('INVALID_FEATURE_FLAG_BODY', 400);
    body = parsed;
  }

  try {
    const upstream = await callApiWorker('/__gateway/feature-flags', {
      method,
      headers: {
        accept: 'application/json',
        'x-feature-flags-token': secret,
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    }, bindings);
    const responseText = await readLimitedText(upstream, 16_384);
    return new NextResponse(responseText, {
      status: upstream.status,
      headers: {
        ...NO_STORE_HEADERS,
        'content-type': upstream.headers.get('content-type') || 'application/json',
      },
    });
  } catch {
    return jsonError('FEATURE_FLAGS_WORKER_UNAVAILABLE', 502);
  }
}

export function GET(request: NextRequest) {
  return proxy(request, 'GET');
}

export function PUT(request: NextRequest) {
  return proxy(request, 'PUT');
}
