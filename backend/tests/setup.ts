import { prisma } from '../src/config/prisma';

jest.mock('../src/config/redis', () => {
  const store = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const rateLimitCounters = new Map<string, { count: number; resetAt: number }>();

  const get = jest.fn(async (key: string) => store.get(key) ?? null);
  const setex = jest.fn(async (key: string, _ttl: number, value: string) => {
    store.set(key, value);
    return 'OK';
  });
  const del = jest.fn(async (...keys: string[]) => {
    let count = 0;
    for (const key of keys) {
      if (store.delete(key)) count += 1;
      if (zsets.delete(key)) count += 1;
    }
    return count;
  });
  const exists = jest.fn(async (key: string) => store.has(key) ? 1 : 0);
  const incr = jest.fn(async (key: string) => {
    const next = Number.parseInt(store.get(key) ?? '0', 10) + 1;
    store.set(key, String(next));
    return next;
  });
  const zadd = jest.fn(async (key: string, score: number | string, member: string) => {
    const zset = zsets.get(key) ?? new Map<string, number>();
    zset.set(member, Number(score));
    zsets.set(key, zset);
    return 1;
  });
  const zrem = jest.fn(async (key: string, member: string) => zsets.get(key)?.delete(member) ? 1 : 0);
  const zrange = jest.fn(async (key: string) =>
    [...(zsets.get(key) ?? new Map<string, number>()).entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member)
  );

  const redis: Record<string, any> = {
    get,
    incr,
    set: jest.fn(async (key: string, value: string, ...flags: unknown[]) => {
      // FIX TEST-V4-03: previously ignored all flags and unconditionally
      // overwrote the key — adLock.ts's withAdImagesLock relies on NX
      // (set-if-not-exists) to detect "another request already holds
      // this lock" and reject accordingly. Without honoring NX here,
      // every lock acquisition attempt always "succeeded" in tests,
      // making it impossible to test the actual mutual-exclusion
      // behavior the lock exists to provide.
      const hasNx = flags.some(f => typeof f === 'string' && f.toUpperCase() === 'NX');
      if (hasNx && store.has(key)) return null; // ioredis returns null when NX prevents the set
      store.set(key, value);
      return 'OK';
    }),
    setex,
    del,
    exists,
    ttl: jest.fn(async () => 604800),
    expire: jest.fn(async () => 1),
    mget: jest.fn(async (...keys: string[]) => keys.map((key) => store.get(key) ?? null)),
    zadd,
    zrem,
    zrange,
    zcard: jest.fn(async (key: string) => zsets.get(key)?.size ?? 0),
    eval: jest.fn(async (script: string, keyCount: number, ...args: string[]) => {
      // FIX TEST-V4-01: previously discriminated which Lua script was
      // running purely by `keyCount`/`args.length` shape — but
      // ROTATE_SCRIPT (refreshLock.ts) and DELETE_ALL_SESSIONS_SCRIPT
      // (tokenStore.ts) both call eval with keyCount=1 and 4 trailing
      // args, so the old heuristic silently ran the wrong mock branch
      // for DELETE_ALL_SESSIONS_SCRIPT calls (misinterpreting them as a
      // token-rotation compare-and-swap). Discriminating by a stable,
      // unique substring each real script's source contains is
      // unambiguous and self-documenting — add a new `if` branch here
      // (matched on something only that script's source contains)
      // whenever a new Lua script needs mock support.
      //
      // ioredis's eval(script, numkeys, ...args) convention: the first
      // `numkeys` entries of args are KEYS[], the rest are ARGV[].
      const keys = args.slice(0, keyCount);
      const argv = args.slice(keyCount);

      if (script.includes("'TOKEN_MISMATCH'")) {
        // ROTATE_SCRIPT (refreshLock.ts): KEYS[1]=key,
        // ARGV=[expectedOldHash, newHash, ttl]
        const [key] = keys;
        const [expected, newValue, ttl] = argv;
        const current = store.get(key);
        if (!current) return 'TOKEN_NOT_FOUND';
        if (current !== expected) return 'TOKEN_MISMATCH';
        await setex(key, Number(ttl), newValue);
        return 'SUCCESS';
      }

      if (script.includes('maxSessions')) {
        // SAVE_SESSION_SCRIPT (tokenStore.ts):
        // KEYS=[zsetKey, metaKey, refreshKey]
        // ARGV=[sessionId, score, metaValue, tokenHash, ttl, maxSessions, userId]
        //
        // BUGFIX (found during a post-implementation code audit): this
        // mock previously ignored the real script's eviction logic
        // entirely (the `if count >= maxSessions then ... DEL oldest
        // ... end` block in tokenStore.ts's own SAVE_SESSION_SCRIPT
        // source) and just unconditionally added the new session. That
        // meant no test in this entire suite could actually catch a
        // regression in the MAX_SESSIONS_PER_USER cap — the real
        // protection against unbounded session growth per user — since
        // the mock always behaved as if the cap didn't exist. Mirrors
        // the real script's behavior: when at/over capacity, evict the
        // oldest session (lowest score = earliest Date.now()) before
        // adding the new one.
        const [zsetKey, metaKey, refreshKey] = keys;
        const [sessionId, score, metaValue, tokenHash, , maxSessionsArg, userId] = argv;
        const maxSessions = Number(maxSessionsArg);

        const zset = zsets.get(zsetKey) ?? new Map<string, number>();
        if (zset.size >= maxSessions) {
          const oldest = [...zset.entries()].sort((a, b) => a[1] - b[1])[0];
          if (oldest) {
            const [oldSid] = oldest;
            await del(`session_meta:${userId}:${oldSid}`);
            await del(`refresh:${userId}:${oldSid}`);
            await zrem(zsetKey, oldSid);
          }
        }

        await zadd(zsetKey, score, sessionId);
        await setex(metaKey, 3600, metaValue);
        await setex(refreshKey, 3600, tokenHash);
        return 'OK';
      }

      if (script.includes('refreshPrefix')) {
        // DELETE_ALL_SESSIONS_SCRIPT (tokenStore.ts): KEYS[1]=zsetKey,
        // ARGV=[userId, refreshPrefix, metaPrefix]
        const [zsetKey] = keys;
        const [userId, refreshPrefix, metaPrefix] = argv;
        const sessionIds = await zrange(zsetKey);
        for (const sid of sessionIds) {
          await del(`${refreshPrefix}${userId}:${sid}`);
          await del(`${metaPrefix}${userId}:${sid}`);
        }
        await del(zsetKey);
        return sessionIds.length;
      }

      if (script.includes("redis.call('GET', KEYS[1])")) {
        // RELEASE_SCRIPT (adLock.ts): KEYS[1]=lockKey, ARGV[1]=token.
        // Compare-and-delete: only releases the lock if the caller's
        // token still matches what's stored (i.e. this caller still
        // owns the lock — a stale/expired caller can't release a lock
        // someone else has since acquired).
        const [lockKey] = keys;
        const [token] = argv;
        if (store.get(lockKey) === token) {
          return await del(lockKey);
        }
        return 0;
      }

      return 'OK';
    }),
    call: jest.fn(async (...args: string[]) => {
      const command = args[0]?.toUpperCase();
      const subCommand = args[1]?.toUpperCase();

      if (command === 'SCRIPT' && subCommand === 'LOAD') return 'mock-script-sha';
      if (command === 'EVALSHA') {
        // rate-limit-redis v4's increment script is invoked as:
        //   EVALSHA <sha> 1 <key> <windowMs>
        // and must return [totalHits, resetInMs] — a real ATOMIC
        // increment against a per-key counter, not a fixed value.
        // A hardcoded [1, ttl] here (the previous behavior) made
        // every single request look like the very first one ever
        // seen for that key, so express-rate-limit's configured max
        // could never actually be reached in any test.
        const key = args[3];
        const windowMs = Number.parseInt(args[4], 10) || 15 * 60 * 1000;
        const now = Date.now();
        const existing = rateLimitCounters.get(key);
        if (!existing || existing.resetAt <= now) {
          rateLimitCounters.set(key, { count: 1, resetAt: now + windowMs });
          return [1, windowMs];
        }
        existing.count += 1;
        return [existing.count, existing.resetAt - now];
      }
      if (command === 'DECR') return 1;
      if (command === 'DEL') return del(...args.slice(1));

      return 0;
    }),
    pipeline: jest.fn(() => {
      const queued: Array<() => Promise<unknown>> = [];
      const pipeline: Record<string, any> = {
        get: jest.fn((key: string) => { queued.push(() => get(key)); return pipeline; }),
        setex: jest.fn((key: string, ttl: number, value: string) => { queued.push(() => setex(key, ttl, value)); return pipeline; }),
        del: jest.fn((...keys: string[]) => { queued.push(() => del(...keys)); return pipeline; }),
        expire: jest.fn(() => { queued.push(async () => 1); return pipeline; }),
        zadd: jest.fn((key: string, score: number | string, member: string) => { queued.push(() => zadd(key, score, member)); return pipeline; }),
        zrem: jest.fn((key: string, member: string) => { queued.push(() => zrem(key, member)); return pipeline; }),
        incr: jest.fn((key: string) => { queued.push(() => incr(key)); return pipeline; }),
        exec: jest.fn(async () => Promise.all(queued.map(async (op) => [null, await op()]))),
      };
      return pipeline;
    }),
    scan: jest.fn(async () => ['0', []] as [string, string[]]),
    ping: jest.fn().mockResolvedValue('PONG'),
    // PROD-FIX-11: redisMemoryMonitor.ts calls redis.info('memory') to
    // read used_memory/maxmemory. Mocked here (rather than left
    // unmocked and letting individual test files spy on it, the way
    // healthCache.test.ts does for `ping`) because redisMemoryMonitor
    // starts its own setInterval poll loop that would otherwise call
    // this on every real test file that happens to import server.ts's
    // module graph, not just tests specifically about the monitor —
    // a safe, generic default here (well under WARNING_THRESHOLD_RATIO)
    // keeps every other test suite's output free of that monitor's
    // warning logs; redisMemoryMonitor.test.ts overrides this per-test
    // via jest.spyOn where it actually needs to test specific values.
    info: jest.fn().mockResolvedValue('used_memory:1048576\r\nmaxmemory:1073741824\r\n'),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    __clear: () => {
      store.clear();
      zsets.clear();
      rateLimitCounters.clear();
    },
  };

  return { redis };
});

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { await prisma.$disconnect(); });
afterEach(async () => {
  const { redis } = await import('../src/config/redis');
  (redis as any).__clear();
  await prisma.auditLog.deleteMany();
  await prisma.report.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.ad.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
});
