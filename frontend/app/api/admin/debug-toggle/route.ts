
import { NextResponse, type NextRequest } from 'next/server';

const COOKIE_NAME = 'mp_debug_console';

async function verifyAdmin(request: NextRequest): Promise<boolean> {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'https://marketplat-api.esamnajjar6.workers.dev';
    const res = await fetch(`${apiBase}/api/v1/auth/me`, {
      method: 'GET',
      headers: { Cookie: cookieHeader },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const data = await res.json();
    const user = data?.data?.user ?? data?.data ?? data?.user ?? data;
    const role = String(user?.role ?? '').toUpperCase();
    return role === 'ADMIN';
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const enabled = request.cookies.get(COOKIE_NAME)?.value === '1';
  return NextResponse.json({ enabled });
}

export async function POST(request: NextRequest) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true, enabled: true });
  response.cookies.set(COOKIE_NAME, '1', {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!(await verifyAdmin(request))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true, enabled: false });
  response.cookies.delete(COOKIE_NAME);
  return response;
}
