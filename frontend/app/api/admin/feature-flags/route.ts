import { NextResponse, type NextRequest } from 'next/server';
import { asRecord, callApiWorker, isSameOriginMutation, jsonError, NO_STORE_HEADERS, readLimitedText, runtimeBindings, type WorkerBinding } from '@/lib/server/gatewayRoute';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RuntimeBindings = {
  API_WORKER?: WorkerBinding;
  FEATURE_FLAGS_ADMIN_TOKEN?: string;
};

function superAdminIdFromPayload(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  const data = asRecord(root.data);
  const candidates = [data?.user, root.user, data?.profile, data, root];
  for (const candidate of candidates) {
    const record = asRecord(candidate);
    if (typeof record?.role !== 'string' || record.role.toUpperCase() !== 'SUPER_ADMIN') continue;
    if (typeof record.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(record.id)) return null;
    return record.id;
  }
  return null;
}

async function verifySuperAdminSession(request: NextRequest, bindings: RuntimeBindings): Promise<string | null> {
  const cookie = request.headers.get('cookie');
  const authorization = request.headers.get('authorization');
  if (!cookie && !authorization) return null;
  const headers = new Headers({ accept: 'application/json' });
  if (cookie) headers.set('cookie', cookie);
  if (authorization) headers.set('authorization', authorization);
  try {
    const response = await callApiWorker('/api/v1/users/me', {
      method: 'GET', headers, cache: 'no-store', signal: AbortSignal.timeout(5_000),
    }, bindings);
    if (!response.ok) return null;
    const payload: unknown = JSON.parse(await readLimitedText(response, 16_384));
    return superAdminIdFromPayload(payload);
  } catch {
    return null;
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
  const bindings = runtimeBindings<RuntimeBindings>();
  if (method === 'PUT' && !isSameOriginMutation(request)) return jsonError('CSRF_REJECTED', 403);
  const actorId = await verifySuperAdminSession(request, bindings);
  if (!actorId) return jsonError('SUPER_ADMIN_REQUIRED', 403);

  const secret = bindings.FEATURE_FLAGS_ADMIN_TOKEN || process.env.FEATURE_FLAGS_ADMIN_TOKEN;
  if (!secret || secret.length < 32) return jsonError('FEATURE_FLAGS_ADMIN_TOKEN_NOT_CONFIGURED_ON_FRONTEND', 503);

  let body: string | undefined;
  if (method === 'PUT') {
    const parsed = await readLimitedJsonBody(request);
    if (!parsed) return jsonError('INVALID_FEATURE_FLAG_BODY', 400);
    body = parsed;
  }

  try {
    const auditLimitRaw = request.nextUrl.searchParams.get('auditLimit');
    const auditLimit = auditLimitRaw && /^\d{1,3}$/.test(auditLimitRaw)
      ? Math.max(1, Math.min(100, Number(auditLimitRaw)))
      : 25;
    const upstreamPath = method === 'GET'
      ? `/__gateway/feature-flags?auditLimit=${auditLimit}`
      : '/__gateway/feature-flags';
    const upstream = await callApiWorker(upstreamPath, {
      method,
      headers: {
        accept: 'application/json',
        'x-feature-flags-token': secret,
        ...(method === 'PUT' ? { 'x-feature-flags-actor': actorId } : {}),
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
