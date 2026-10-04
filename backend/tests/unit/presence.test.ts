import { presence } from '../../src/shared/utils/presence';
import { redis } from '../../src/config/redis';

describe('presence', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('touch', () => {
    it('sets a TTL-bound key for the user', async () => {
      const setexSpy = jest.spyOn(redis, 'setex').mockResolvedValue('OK');

      await presence.touch('user-1');

      expect(setexSpy).toHaveBeenCalledWith('presence:user-1', 90, '1');
    });

    it('swallows redis errors rather than throwing', async () => {
      jest.spyOn(redis, 'setex').mockRejectedValue(new Error('redis down'));

      await expect(presence.touch('user-1')).resolves.toBeUndefined();
    });
  });

  describe('getPresence', () => {
    it('returns an empty set for an empty input without calling redis', async () => {
      const mgetSpy = jest.spyOn(redis, 'mget');

      const result = await presence.getPresence([]);

      expect(result).toEqual({});
      expect(mgetSpy).not.toHaveBeenCalled();
    });

    it('returns only the ids whose presence key exists', async () => {
      jest.spyOn(redis, 'mget')
        .mockResolvedValueOnce(['1', null, '1'])
        .mockResolvedValueOnce([null, null, null]);

      const result = await presence.getPresence(['user-1', 'user-2', 'user-3']);

      expect(result).toEqual({
        'user-1': { online: true, lastSeenAt: null },
        'user-2': { online: false, lastSeenAt: null },
        'user-3': { online: true, lastSeenAt: null },
      });
    });

    it('queries with the presence-prefixed keys in the same order as the input', async () => {
      const mgetSpy = jest.spyOn(redis, 'mget').mockResolvedValue([null, null]);

      await presence.getPresence(['user-1', 'user-2']);

      expect(mgetSpy).toHaveBeenCalledWith('presence:user-1', 'presence:user-2');
    });

    it('returns an empty set (everyone offline) when redis fails', async () => {
      jest.spyOn(redis, 'mget').mockRejectedValue(new Error('redis down'));

      const result = await presence.getPresence(['user-1', 'user-2']);

      expect(result).toEqual({});
    });
  });
});
