import { describe, it, expect, vi, afterEach } from 'vitest';
import { adminRouteFetch } from '@/lib/adminRouteFetch';

describe('adminRouteFetch', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends same-origin, no-store GET requests by default', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await adminRouteFetch('/api/admin/feature-flags');
    expect(spy).toHaveBeenCalledWith('/api/admin/feature-flags', {
      method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: {},
    });
  });
  it('serialises the body, sets JSON content-type and merges extra headers', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await adminRouteFetch('/api/admin/gateway', { method: 'PUT', body: { a: 1 }, headers: { authorization: 'Bearer t' } });
    expect(spy).toHaveBeenCalledWith('/api/admin/gateway', {
      method: 'PUT', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
      body: '{"a":1}',
    });
  });
});
