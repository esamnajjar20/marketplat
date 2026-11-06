import { NextResponse, type NextRequest } from 'next/server';
import { PRODUCTION_API_ORIGIN } from '@/lib/constants';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const COOKIE_NAME = 'mp_debug_console';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

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

function apiAuthUrl(): URL | null {
  try {
    const configured = process.env.API_BASE_URL?.trim() || process.env.NEXT_PUBLIC_API_URL?.trim() || PRODUCTION_API_ORIGIN;
    const url = new URL(configured);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const basePath = url.pathname.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
    return new URL(`${basePath}/api/v1/auth/me`, url.origin);
  } catch {
    return null;
  }
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
    const role = record?.role;
    if (typeof role === 'string') return role.toUpperCase();
  }
  return null;
}

async function verifyAdmin(request: NextRequest): Promise<boolean> {
  const cookieHeader = request.headers.get('cookie');
  const url = apiAuthUrl();
  if (!cookieHeader || !url) return false;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Cookie: cookieHeader, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return false;
    const payload: unknown = await response.json();
    const role = roleFromPayload(payload);
    return role === 'ADMIN' || role === 'SUPER_ADMIN';
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const enabled = request.cookies.get(COOKIE_NAME)?.value === '1';
  return NextResponse.json({ enabled }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'CSRF_REJECTED' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const response = NextResponse.json({ ok: true, enabled: true }, { headers: NO_STORE_HEADERS });
  response.cookies.set(COOKIE_NAME, '1', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'CSRF_REJECTED' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers: NO_STORE_HEADERS });
  }
  const response = NextResponse.json({ ok: true, enabled: false }, { headers: NO_STORE_HEADERS });
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  });
  return response;
}
