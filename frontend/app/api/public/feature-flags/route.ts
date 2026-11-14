import { NextResponse } from 'next/server';
import { apiFallbackOrigin, NO_STORE_HEADERS, readLimitedText, runtimeBindings, type WorkerBinding } from '@/lib/server/gatewayRoute';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type RuntimeBindings = { API_WORKER?: WorkerBinding };

export async function GET() {
  try {
    const bindings = runtimeBindings<RuntimeBindings>();
    if (bindings.API_WORKER) {
      const response = await bindings.API_WORKER.fetch(new Request('https://api/__gateway/public-feature-flags', {
        method: 'GET', headers: { accept: 'application/json' },
      }));
      const body = await readLimitedText(response, 16_384);
      return new NextResponse(body, {
        status: response.status,
        headers: { ...NO_STORE_HEADERS, 'content-type': response.headers.get('content-type') || 'application/json' },
      });
    }
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'API_WORKER_UNAVAILABLE' }, { status: 503, headers: NO_STORE_HEADERS });
    }
    const origin = apiFallbackOrigin();
    if (!origin) throw new Error('Invalid API origin');
    const url = new URL('/__gateway/public-feature-flags', origin);
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5_000) });
    const body = await readLimitedText(response, 16_384);
    return new NextResponse(body, {
      status: response.status,
      headers: { ...NO_STORE_HEADERS, 'content-type': response.headers.get('content-type') || 'application/json' },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'FEATURE_FLAGS_WORKER_UNAVAILABLE' }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
