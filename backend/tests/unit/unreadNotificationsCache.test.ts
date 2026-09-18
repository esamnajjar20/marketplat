import { unreadNotificationsCache } from '../../src/shared/utils/unreadNotificationsCache';
import { redis } from '../../src/config/redis';

jest.mock('../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    publish: jest.fn(),
    __clear: jest.fn(),
  },
}));

describe('unreadNotificationsCache', () => {
  beforeEach(() => jest.clearAllMocks());

  it('get returns null on cache miss', async () => {
    (redis.get as jest.Mock).mockResolvedValue(null);
    expect(await unreadNotificationsCache.get('u1')).toBeNull();
  });

  it('get parses a finite number', async () => {
    (redis.get as jest.Mock).mockResolvedValue('7');
    expect(await unreadNotificationsCache.get('u1')).toBe(7);
  });

  it('get returns null for non-numeric values', async () => {
    (redis.get as jest.Mock).mockResolvedValue('abc');
    expect(await unreadNotificationsCache.get('u1')).toBeNull();
  });

  it('get returns null when redis throws', async () => {
    (redis.get as jest.Mock).mockRejectedValue(new Error('down'));
    expect(await unreadNotificationsCache.get('u1')).toBeNull();
  });

  it('set writes with TTL and swallows errors', async () => {
    (redis.setex as jest.Mock).mockResolvedValue('OK');
    await unreadNotificationsCache.set('u1', 3);
    expect(redis.setex).toHaveBeenCalled();

    (redis.setex as jest.Mock).mockRejectedValue(new Error('down'));
    await expect(unreadNotificationsCache.set('u1', 1)).resolves.toBeUndefined();
  });

  it('invalidate deletes the cache key', async () => {
    (redis.del as jest.Mock).mockResolvedValue(1);
    (redis.publish as jest.Mock).mockResolvedValue(0);
    await unreadNotificationsCache.invalidate('u1');
    expect(redis.del).toHaveBeenCalledWith('unread_notifications_count:u1');
  });

  // Cross-worker invalidation (PM2 cluster mode): invalidate() must
  // also publish the userId so other workers drop their L1 entry.
  it('invalidate publishes the userId on the invalidation channel', async () => {
    (redis.del as jest.Mock).mockResolvedValue(1);
    (redis.publish as jest.Mock).mockResolvedValue(0);
    await unreadNotificationsCache.invalidate('u1');
    expect(redis.publish).toHaveBeenCalledWith(
      'unread_notifications_count:invalidate',
      'u1',
    );
  });

  it('invalidate swallows Redis errors on both del and publish', async () => {
    (redis.del as jest.Mock).mockRejectedValue(new Error('down'));
    (redis.publish as jest.Mock).mockResolvedValue(0);
    await expect(unreadNotificationsCache.invalidate('u1')).resolves.toBeUndefined();
  });
});
