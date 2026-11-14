import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/csrf', () => ({ getCsrfToken: () => 'csrf-123' }));

import { sameOriginApi, SameOriginApiError } from '@/lib/sameOriginApi';

describe('sameOriginApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('GET: includes credentials, no CSRF header, returns parsed envelope', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ success: true, data: [1] }), { status: 200 }));
    const res = await sameOriginApi<number[]>('/sellers/ranking?limit=5', { cache: 'no-store' });
    expect(res.data).toEqual([1]);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('/api/v1/sellers/ranking?limit=5');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', cache: 'no-store' });
    expect((init as RequestInit).headers).toBeUndefined();
  });

  it('PATCH: sends JSON body and the CSRF header', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ data: {} }), { status: 200 }));
    await sameOriginApi('/ads/a1/pin', { method: 'PATCH', body: { isPinned: true } });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init).toMatchObject({ method: 'PATCH', body: JSON.stringify({ isPinned: true }) });
    expect((init as { headers: Record<string, string> }).headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-CSRF-Token': 'csrf-123',
    });
  });

  it('throws SameOriginApiError carrying status and the server message', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ message: 'ممنوع' }), { status: 403 }));
    await expect(sameOriginApi('/x')).rejects.toMatchObject({ name: 'SameOriginApiError', status: 403, message: 'ممنوع' });
    await expect(sameOriginApi('/x')).rejects.toBeInstanceOf(SameOriginApiError);
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(sameOriginApi('/x')).rejects.toMatchObject({ status: 500, message: 'Request failed (500)' });
  });
});
