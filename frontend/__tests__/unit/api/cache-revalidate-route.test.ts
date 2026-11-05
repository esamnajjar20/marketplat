import { beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

const cacheMocks = vi.hoisted(() => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => cacheMocks);
vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: () => ({ env: {} }),
}));

import { POST } from '../../../app/api/internal/cache/revalidate/route';

const SECRET = 'marketplat-next-cache-revalidation-secret-2026';

async function signedRequest(body: string, timestamp = Math.floor(Date.now() / 1000).toString()) {
  const key = await webcrypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await webcrypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const hex = Array.from(new Uint8Array(signature), (value) => value.toString(16).padStart(2, '0')).join('');

  return new Request('https://marketplat.example/api/internal/cache/revalidate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-marketplat-timestamp': timestamp,
      'x-marketplat-signature': `sha256=${hex}`,
    },
    body,
  });
}

describe('Next Data Cache revalidation Route Handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal('crypto', webcrypto as unknown as Crypto);
    vi.stubEnv('NEXT_CACHE_REVALIDATION_SECRET', SECRET);
  });

  it('revalidates allowed tags and their mapped App Router paths for a valid signature', async () => {
    const body = JSON.stringify({ tags: ['route:products', 'product:product_12'] });
    const response = await POST(await signedRequest(body));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, revalidatedTags: 2, revalidatedPaths: 2 });
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith('route:products');
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith('product:product_12');
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/products');
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/products/[id]', 'page');
  });

  it('maps city-scoped ad purges to the shared Next ads and homepage entries', async () => {
    const body = JSON.stringify({ tags: ['city:any', 'ad:ad_42'] });
    const response = await POST(await signedRequest(body));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, revalidatedTags: 4 });
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith('city:any');
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith('ad:ad_42');
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith('route:ads');
    expect(cacheMocks.revalidateTag).toHaveBeenCalledWith('route:home');
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/ads');
    expect(cacheMocks.revalidatePath).toHaveBeenCalledWith('/');
  });

  it('rejects an invalid signature without touching the cache', async () => {
    const request = await signedRequest(JSON.stringify({ tags: ['route:ads'] }));
    request.headers.set('x-marketplat-signature', 'sha256=00');
    const response = await POST(request);

    expect(response.status).toBe(401);
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects stale signed requests', async () => {
    const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString();
    const response = await POST(await signedRequest(JSON.stringify({ tags: ['route:ads'] }), oldTimestamp));

    expect(response.status).toBe(401);
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects oversized request bodies before parsing or touching the cache', async () => {
    const oversizedBody = JSON.stringify({ tags: ['route:ads'], extra: 'x'.repeat(9_000) });
    const response = await POST(await signedRequest(oversizedBody));

    expect(response.status).toBe(413);
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects tags outside the public cache vocabulary', async () => {
    const response = await POST(await signedRequest(JSON.stringify({ tags: ['route:users'] })));

    expect(response.status).toBe(400);
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
  });

  it('does not disclose or accept the endpoint when the shared secret is missing', async () => {
    vi.stubEnv('NEXT_CACHE_REVALIDATION_SECRET', '');
    const response = await POST(await signedRequest(JSON.stringify({ tags: ['route:ads'] })));

    expect(response.status).toBe(503);
    expect(cacheMocks.revalidateTag).not.toHaveBeenCalled();
  });
});
