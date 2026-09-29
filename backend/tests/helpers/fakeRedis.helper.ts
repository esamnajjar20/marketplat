/**
 * Minimal stateful Redis stand-in for the SWR cache tests: get / mget / set
 * (EX, PX, NX) / del / eval (compare-and-delete lock release). Kept as jest.fn
 * wrappers so tests can override single calls (mockRejectedValueOnce, ...).
 *
 * Usage (factory must `require` it — jest.mock is hoisted above imports):
 *   jest.mock('../../src/config/redis', () => require('../helpers/fakeRedis.helper').fakeRedisModule());
 */
type Entry = { value: string; expiresAt: number | null };

export function fakeRedisModule(): { redis: Record<string, jest.Mock>; __store: Map<string, Entry> } {
  const store = new Map<string, Entry>();
  const live = (key: string): Entry | null => {
    const entry = store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return entry;
  };

  const redis: Record<string, jest.Mock> = {
    get: jest.fn(async (key: string) => live(key)?.value ?? null),
    mget: jest.fn(async (...keys: string[]) => keys.map(key => live(key)?.value ?? null)),
    set: jest.fn(async (key: string, value: string, ...flags: unknown[]) => {
      let expiresAt: number | null = null;
      let nx = false;
      for (let i = 0; i < flags.length; i += 1) {
        const flag = String(flags[i]).toUpperCase();
        if (flag === 'EX') expiresAt = Date.now() + Number(flags[(i += 1)]) * 1000;
        else if (flag === 'PX') expiresAt = Date.now() + Number(flags[(i += 1)]);
        else if (flag === 'NX') nx = true;
      }
      if (nx && live(key)) return null;
      store.set(key, { value, expiresAt });
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => {
      keys.forEach(key => store.delete(key));
      return keys.length;
    }),
    eval: jest.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
      const entry = live(key);
      if (entry && entry.value === token) {
        store.delete(key);
        return 1;
      }
      return 0;
    }),
  };
  return { redis, __store: store };
}

/** Restores the default implementations after jest.resetAllMocks() wiped them. */
export const clearFakeRedis = (mod: { __store: Map<string, Entry> }): void => mod.__store.clear();
