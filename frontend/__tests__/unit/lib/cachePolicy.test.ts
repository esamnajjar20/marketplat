import { describe, expect, it } from 'vitest';
import policy from '@/lib/cache-policy.json';
import { CACHE_POLICY, CLIENT_CACHE_DEFAULTS } from '@/lib/cachePolicy';


describe('unified cache policy', () => {
  it('uses the generated canonical policy', () => {
    expect(CACHE_POLICY.version).toBe(policy.version);
    expect(CLIENT_CACHE_DEFAULTS.staleTime).toBe(policy.publicLive.client.staleTimeMs);
    expect(CLIENT_CACHE_DEFAULTS.gcTime).toBe(policy.publicLive.client.gcTimeMs);
  });

  it('keeps authenticated HTTP caching private by contract', () => {
    expect(policy.personal.http.maxAgeSec).toBe(0);
    expect(policy.messages.http.maxAgeSec).toBe(0);
    expect(policy.security.http.maxAgeSec).toBe(0);
  });

  it('keeps Service Worker storage bounded', () => {
    expect(policy.storage.serviceWorker.apiEntries).toBeGreaterThan(0);
    expect(policy.storage.serviceWorker.staticBytes).toBeGreaterThan(0);
    expect(policy.storage.serviceWorker.userDataBytes).toBeGreaterThan(0);
  });
});
