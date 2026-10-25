import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DENIED_RETRY_AFTER_MS, ensurePersistentStorage } from '@/lib/offlineStoragePersist';

type StorageStub = { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> };

function installNavigatorStorage(storage: StorageStub | undefined) {
  Object.defineProperty(globalThis, 'navigator', { value: { storage }, configurable: true, writable: true });
}

function installLocalStorage() {
  const data = new Map<string, string>();
  (globalThis as any).window = {
    localStorage: {
      getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
      setItem: (k: string, v: string) => { data.set(k, v); },
    },
  };
  return data;
}

describe('ensurePersistentStorage', () => {
  let calls = 0;
  beforeEach(() => { calls = 0; installLocalStorage(); });
  afterEach(() => { delete (globalThis as any).window; });

  it('reports unsupported when the API is missing', async () => {
    installNavigatorStorage(undefined);
    expect(await ensurePersistentStorage()).toBe('unsupported');
  });

  it('does not re-request when already persisted', async () => {
    installNavigatorStorage({ persisted: async () => true, persist: async () => { calls += 1; return true; } });
    expect(await ensurePersistentStorage()).toBe('already');
    expect(calls).toBe(0);
  });

  it('requests persistence and returns granted', async () => {
    installNavigatorStorage({ persisted: async () => false, persist: async () => { calls += 1; return true; } });
    expect(await ensurePersistentStorage()).toBe('granted');
    expect(calls).toBe(1);
  });

  it('throttles re-asking after a denial, then asks again after the window', async () => {
    installNavigatorStorage({ persisted: async () => false, persist: async () => { calls += 1; return false; } });
    const t0 = 1_000_000;
    expect(await ensurePersistentStorage(t0)).toBe('denied');
    expect(await ensurePersistentStorage(t0 + 1000)).toBe('throttled');
    expect(calls).toBe(1);
    expect(await ensurePersistentStorage(t0 + DENIED_RETRY_AFTER_MS + 1)).toBe('denied');
    expect(calls).toBe(2);
  });

  it('swallows API errors', async () => {
    installNavigatorStorage({ persisted: async () => false, persist: async () => { throw new Error('boom'); } });
    expect(await ensurePersistentStorage()).toBe('denied');
  });
});
