import { getCloudflareContext } from '@opennextjs/cloudflare';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type WorkerBinding = { fetch: (request: Request) => Promise<Response> };
type RuntimeBindings = { API_WORKER?: WorkerBinding };
const NO_STORE_HEADERS = { 'cache-control': 'no-store, max-age=0' };

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get('content-length');
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)) {
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
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function runtimeBindings(): RuntimeBindings {
  try {
    return getCloudflareContext().env as unknown as RuntimeBindings;
  } catch {
    return {};
  }
}

export async function GET() {
  try {
    const bindings = runtimeBindings();
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
    const origin = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
    const base = new URL(origin);
    if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('Invalid API origin');
    const url = new URL('/__gateway/public-feature-flags', base.origin);
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
