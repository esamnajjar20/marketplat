import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type WorkerBinding = { fetch: (request: Request) => Promise<Response> };
type RuntimeBindings = {
  API_WORKER?: WorkerBinding;
  GATEWAY_ADMIN_TOKEN?: string;
};

const NO_STORE_HEADERS = { 'cache-control': 'no-store, max-age=0' };
const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

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

  // Local development fallback only. In production, use the configured Service
  // Binding to avoid Worker-to-Worker workers.dev error 1042.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('API_WORKER service binding is unavailable');
  }
  const origin = apiFallbackOrigin();
  if (!origin) throw new Error('API origin is not configured');
  return fetch(new URL(path, origin), { ...init, redirect: 'manual', cache: 'no-store' });
}

async function readLimitedResponseText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)) {
    throw new Error('Upstream response exceeded the configured size limit');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error('Upstream response exceeded the configured size limit');
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function roleFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : null;
  const candidates = [
    data?.user,
    root.user,
    data?.profile,
    data,
    root,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      const role = (candidate as Record<string, unknown>).role;
      if (typeof role === 'string') return role.toUpperCase();
    }
  }
  return null;
}

async function verifyAdminSession(request: NextRequest, bindings: RuntimeBindings): Promise<boolean> {
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (!cookie && !authorization) return false;

  const headers = new Headers({ accept: 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);

  try {
    const response = await callApiWorker('/api/v1/users/me', {
      method: 'GET',
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    }, bindings);
    if (!response.ok) return false;
    const responseText = await readLimitedResponseText(response, 16_384);
    const payload: unknown = JSON.parse(responseText);
    const role = roleFromPayload(payload);
    return role !== null && ADMIN_ROLES.has(role);
  } catch {
    return false;
  }
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

type LimitedJsonBodyResult =
  | { ok: true; body: string }
  | { ok: false; reason: 'TOO_LARGE' | 'UNSUPPORTED_MEDIA_TYPE' | 'INVALID_JSON' };

async function readLimitedJsonBody(request: Request, maxBytes: number): Promise<LimitedJsonBodyResult> {
  const mediaType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') {
    return { ok: false, reason: 'UNSUPPORTED_MEDIA_TYPE' };
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes) {
      return { ok: false, reason: 'TOO_LARGE' };
    }
  }

  if (!request.body) return { ok: false, reason: 'INVALID_JSON' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: 'TOO_LARGE' };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: 'INVALID_JSON' };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let body: string;
  try {
    body = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'INVALID_JSON' };
    }
  } catch {
    return { ok: false, reason: 'INVALID_JSON' };
  }

  return { ok: true, body };
}

async function proxyRegistry(request: NextRequest, method: 'GET' | 'PUT' | 'POST') {
  const bindings = runtimeBindings();
  if (!(await verifyAdminSession(request, bindings))) return jsonError('FORBIDDEN', 403);

  if (method !== 'GET' && !isSameOriginMutation(request)) {
    return jsonError('CSRF_REJECTED', 403);
  }

  const adminToken = bindings.GATEWAY_ADMIN_TOKEN || process.env.GATEWAY_ADMIN_TOKEN;
  if (!adminToken) return jsonError('GATEWAY_ADMIN_TOKEN_NOT_CONFIGURED_ON_FRONTEND', 503);

  const headers = new Headers({
    accept: 'application/json',
    'x-gateway-admin-token': adminToken,
  });
  let body: string | undefined;
  if (method !== 'GET') {
    const maxBytes = method === 'PUT' ? 65_536 : 1_024;
    const parsedBody = await readLimitedJsonBody(request, maxBytes);
    if (!parsedBody.ok) {
      if (parsedBody.reason === 'TOO_LARGE') return jsonError('REQUEST_TOO_LARGE', 413);
      if (parsedBody.reason === 'UNSUPPORTED_MEDIA_TYPE') return jsonError('UNSUPPORTED_MEDIA_TYPE', 415);
      return jsonError('INVALID_JSON_BODY', 400);
    }
    body = parsedBody.body;
    headers.set('content-type', 'application/json');
  }

  try {
    const upstream = await callApiWorker('/__gateway/registry', {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    }, bindings);
    // Registry state is small by contract; cap the upstream payload to avoid
    // buffering an unbounded Worker response in this Route Handler.
    const responseText = await readLimitedResponseText(upstream, 262_144);
    return new NextResponse(responseText, {
      status: upstream.status,
      headers: {
        ...NO_STORE_HEADERS,
        'content-type': upstream.headers.get('content-type') || 'application/json',
      },
    });
  } catch {
    return jsonError('GATEWAY_WORKER_UNAVAILABLE', 502);
  }
}

export async function GET(request: NextRequest) {
  return proxyRegistry(request, 'GET');
}

export async function PUT(request: NextRequest) {
  return proxyRegistry(request, 'PUT');
}

export async function POST(request: NextRequest) {
  return proxyRegistry(request, 'POST');
}
