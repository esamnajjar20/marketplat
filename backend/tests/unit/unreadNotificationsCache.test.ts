import { unreadNotificationsCache } from '../../src/shared/utils/unreadNotificationsCache';
import { redis } from '../../src/config/redis';

jest.mock('../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    setex: jest.fn(),
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
});
