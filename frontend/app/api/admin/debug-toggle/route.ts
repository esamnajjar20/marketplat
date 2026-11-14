import { NextResponse, type NextRequest } from 'next/server';
import { PRODUCTION_API_ORIGIN } from '@/lib/constants';
import { getRawApiUrl, getRawServerApiBaseUrl } from '@/lib/env';
import { isSameOriginMutation, NO_STORE_HEADERS, roleFromPayload } from '@/lib/server/gatewayRoute';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const COOKIE_NAME = 'mp_debug_console';

function apiAuthUrl(): URL | null {
  try {
    const configured = getRawServerApiBaseUrl()?.trim() || getRawApiUrl()?.trim() || PRODUCTION_API_ORIGIN;
    const url = new URL(configured);
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return null;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const basePath = url.pathname.replace(/\/api\/v1\/?$/, '').replace(/\/+$/, '');
    return new URL(`${basePath}/api/v1/auth/me`, url.origin);
  } catch {
    return null;
  }
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
