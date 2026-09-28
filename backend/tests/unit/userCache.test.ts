import { userCache } from '../../src/shared/utils/userCache';
import { redis } from '../../src/config/redis';
import { prisma } from '../../src/config/prisma';

describe('userCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(redis, 'get').mockResolvedValue(null);
    jest.spyOn(redis, 'setex').mockResolvedValue('OK');
    jest.spyOn(redis, 'del').mockResolvedValue(1);
    jest.spyOn(redis, 'publish').mockResolvedValue(0);
  });

  afterEach(() => jest.restoreAllMocks());

  it('get returns parsed cached user', async () => {
    jest.spyOn(redis, 'get').mockResolvedValue(JSON.stringify({ id: 'u1', role: 'USER', isActive: true }));
    const result = await userCache.get('u1');
    expect(result?.role).toBe('USER');
  });

  it('get returns null on redis error', async () => {
    jest.spyOn(redis, 'get').mockRejectedValue(new Error('redis down'));
    const result = await userCache.get('u1');
    expect(result).toBeNull();
  });

  it('set swallows redis errors', async () => {
    jest.spyOn(redis, 'setex').mockRejectedValue(new Error('redis down'));
    await expect(userCache.set({ id: 'u1', role: 'USER', isActive: true })).resolves.toBeUndefined();
  });

  it('invalidate deletes cache key', async () => {
    await userCache.invalidate('u1');
    expect(redis.del).toHaveBeenCalledWith('user_cache:u1');
  });

  // Cross-worker invalidation (PM2 cluster mode): invalidate() must
  // also publish the userId so other workers drop their L1 entry.
  it('invalidate publishes the userId on the invalidation channel', async () => {
    await userCache.invalidate('u1');
    expect(redis.publish).toHaveBeenCalledWith('user_cache:invalidate', 'u1');
  });

  it('getOrFetch loads from DB on cache miss', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'u1',
      role: 'ADMIN',
      isActive: true,
    } as any);

    const result = await userCache.getOrFetch('u1');
    expect(result?.role).toBe('ADMIN');
    expect(redis.setex).toHaveBeenCalled();
  });

  it('getOrFetch returns null when user not found', async () => {
    jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null);
    const result = await userCache.getOrFetch('missing');
    expect(result).toBeNull();
  });

  it('deduplicates concurrent getOrFetch for same user', async () => {
    let resolveFind!: (value: unknown) => void;
    const pending = new Promise(resolve => {
      resolveFind = resolve;
    });
    jest.spyOn(prisma.user, 'findUnique').mockReturnValue(pending as any);

    const first = userCache.getOrFetch('u1');
    const second = userCache.getOrFetch('u1');
    resolveFind({ id: 'u1', role: 'USER', isActive: true });

    const [a, b] = await Promise.all([first, second]);
    expect(a?.id).toBe('u1');
    expect(b?.id).toBe('u1');
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });

  // FIX USERCACHE-RACE-01: invalidate() during an in-flight DB read must
  // not let the pre-change snapshot be written back into the cache.
  it('does not re-cache a snapshot that was invalidated mid-fetch', async () => {
    let resolveFirst!: (value: unknown) => void;
    const first = new Promise(resolve => {
      resolveFirst = resolve;
    });
    const find = jest
      .spyOn(prisma.user, 'findUnique')
      .mockReturnValueOnce(first as any)
      // re-read after the invalidation sees the banned state
      .mockResolvedValueOnce({ id: 'u9', role: 'USER', isActive: false } as any);

    const pending = userCache.getOrFetch('u9');
    await new Promise(r => setImmediate(r));
    await userCache.invalidate('u9'); // admin ban lands here
    resolveFirst({ id: 'u9', role: 'USER', isActive: true }); // stale snapshot

    const result = await pending;
    expect(find).toHaveBeenCalledTimes(2);
    expect(result?.isActive).toBe(false);
    const written = (redis.setex as jest.Mock).mock.calls.map(c => JSON.parse(c[2]));
    expect(written.some(u => u.isActive === true)).toBe(false);
  });
});
