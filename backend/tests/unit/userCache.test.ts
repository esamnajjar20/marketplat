import { userCache } from '../../src/shared/utils/userCache';
import { redis } from '../../src/config/redis';
import { prisma } from '../../src/config/prisma';

describe('userCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(redis, 'get').mockResolvedValue(null);
    jest.spyOn(redis, 'setex').mockResolvedValue('OK');
    jest.spyOn(redis, 'del').mockResolvedValue(1);
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
});
