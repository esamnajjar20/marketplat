import { NextResponse, type NextRequest } from 'next/server';
import { callApiWorker, isSameOriginMutation, jsonError, NO_STORE_HEADERS, readLimitedText, roleFromPayload, runtimeBindings, type WorkerBinding } from '@/lib/server/gatewayRoute';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RuntimeBindings = {
  API_WORKER?: WorkerBinding;
  GATEWAY_ADMIN_TOKEN?: string;
};

const ADMIN_ROLES = new Set(['ADMIN', 'SUPER_ADMIN']);

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
    const responseText = await readLimitedText(response, 16_384);
    const payload: unknown = JSON.parse(responseText);
    const role = roleFromPayload(payload);
    return role !== null && ADMIN_ROLES.has(role);
  } catch {
    return false;
  }
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
  const bindings = runtimeBindings<RuntimeBindings>();
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
    const upstreamPath = method === 'GET' && request.nextUrl.searchParams.get('refresh') === '1'
      ? '/__gateway/registry?refresh=1'
      : '/__gateway/registry';
    const upstream = await callApiWorker(upstreamPath, {
      method,
      headers,
      ...(body !== undefined ? { body } : {}),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    }, bindings);
    // Registry state is small by contract; cap the upstream payload to avoid
    // buffering an unbounded Worker response in this Route Handler.
    const responseText = await readLimitedText(upstream, 262_144);
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
