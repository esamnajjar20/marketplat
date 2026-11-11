import { presence } from '../../src/shared/realtime/presence';
import { redis } from '../../src/config/redis';

describe('presence', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('touch', () => {
    it('pipelines a TTL-bound presence key and a longer last-seen key with ISO timestamps', async () => {
      const pipeline = {
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 'OK'], [null, 'OK']]),
      };
      jest.spyOn(redis, 'pipeline').mockReturnValue(pipeline as never);

      await presence.touch('user-1');

      expect(pipeline.setex).toHaveBeenCalledTimes(2);
      expect(pipeline.setex).toHaveBeenCalledWith(
        'presence:user-1',
        200,
        expect.stringMatching(/^\\d{4}-\\d{2}-\\d{2}T/)
      );
      expect(pipeline.setex).toHaveBeenCalledWith(
        'presence:last-seen:user-1',
        30 * 24 * 60 * 60,
        expect.stringMatching(/^\\d{4}-\\d{2}-\\d{2}T/)
      );
      expect(pipeline.exec).toHaveBeenCalledTimes(1);
    });

    it('swallows redis errors rather than throwing', async () => {
      const pipeline = {
        setex: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('redis down')),
      };
      jest.spyOn(redis, 'pipeline').mockReturnValue(pipeline as never);

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
      jest
        .spyOn(redis, 'mget')
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

    it('returns everyone offline (with null lastSeen) when redis fails', async () => {
      jest.spyOn(redis, 'mget').mockRejectedValue(new Error('redis down'));

      const result = await presence.getPresence(['user-1', 'user-2']);

      expect(result).toEqual({
        'user-1': { online: false, lastSeenAt: null },
        'user-2': { online: false, lastSeenAt: null },
      });
    });
  });
});
