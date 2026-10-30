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

  it('keeps the private user-profile cache per-user and bounded across cache layers', () => {
    expect(policy.privateUserProfile.server.softTtlMs).toBe(20_000);
    expect(policy.privateUserProfile.server.hardTtlSec).toBe(60);
    expect(policy.privateUserProfile.http.maxAgeSec).toBe(0);
    expect(policy.privateUserProfile.client.staleTimeMs).toBe(120_000);
    expect(policy.privateUserProfile.offline.staleAfterMs).toBe(900_000);
    expect(policy.privateUserProfile.offline.hardAfterMs).toBe(86_400_000);
  });

  it('keeps Service Worker storage bounded', () => {
    expect(policy.storage.serviceWorker.apiEntries).toBeGreaterThan(0);
    expect(policy.storage.serviceWorker.staticBytes).toBeGreaterThan(0);
    expect(policy.storage.serviceWorker.userDataBytes).toBeGreaterThan(0);
  });

  it('uses the enlarged but finite offline storage budgets', () => {
    expect(policy.storage.serviceWorker.apiEntries).toBe(200);
    expect(policy.storage.serviceWorker.imageEntries).toBe(300);
    expect(policy.storage.serviceWorker.staticEntries).toBe(1200);
    expect(policy.storage.serviceWorker.staticBytes).toBe(100 * 1024 * 1024);
    expect(policy.storage.serviceWorker.userDataEntries).toBe(600);
    expect(policy.storage.serviceWorker.userDataBytes).toBe(80 * 1024 * 1024);
    expect(policy.storage.serviceWorker.savedAdsEntries).toBe(1500);
    expect(policy.storage.serviceWorker.personalShellEntries).toBe(750);
  });
});
