import { UserActivityType } from '@prisma/client';
import { activityBuffer } from '../../src/shared/utils/activityBuffer';
import { redis } from '../../src/config/redis';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    userActivity: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
  },
}));

describe('activityBuffer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  const input = {
    userId: 'user-1',
    type: UserActivityType.AD_CREATED,
    title: 'تم نشر إعلان جديد',
    description: 'iPhone 13',
  };

  describe('push', () => {
    it('pushes a serialized entry onto the Redis list with a TTL, via a pipeline', async () => {
      const pipelineMock = {
        rpush: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      jest.spyOn(redis, 'pipeline').mockReturnValue(pipelineMock as any);

      await activityBuffer.push(input);

      expect(pipelineMock.rpush).toHaveBeenCalledWith(
        'activity_buffer:pending',
        expect.stringContaining(input.userId)
      );
      expect(pipelineMock.expire).toHaveBeenCalledWith(
        'activity_buffer:pending',
        24 * 60 * 60
      );
      expect(pipelineMock.exec).toHaveBeenCalled();
    });

    it('falls back to a direct Postgres write when Redis is unavailable', async () => {
      jest.spyOn(redis, 'pipeline').mockImplementation(() => {
        throw new Error('redis down');
      });
      const prisma = await import('../../src/config/prisma');
      const create = jest.spyOn(prisma.prisma.userActivity, 'create').mockResolvedValue({} as any);

      await activityBuffer.push(input);

      expect(create).toHaveBeenCalledWith({ data: input });
    });
  });

  describe('flush', () => {
    it('drains buffered entries via LPOP and inserts them with one createMany() call', async () => {
      const entry = { ...input, createdAt: '2026-08-08T00:00:00.000Z' };
      jest.spyOn(redis, 'lpop').mockResolvedValue([JSON.stringify(entry)] as any);

      const prisma = await import('../../src/config/prisma');
      const createMany = jest
        .spyOn(prisma.prisma.userActivity, 'createMany')
        .mockResolvedValue({ count: 1 });

      await activityBuffer.flush();

      expect(redis.lpop).toHaveBeenCalledWith('activity_buffer:pending', 500);
      expect(createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: input.userId,
            type: input.type,
            title: input.title,
            description: input.description,
            createdAt: new Date(entry.createdAt),
          },
        ],
      });
    });

    it('does nothing when the buffer is empty', async () => {
      jest.spyOn(redis, 'lpop').mockResolvedValue(null as any);
      const prisma = await import('../../src/config/prisma');
      const createMany = jest.spyOn(prisma.prisma.userActivity, 'createMany');

      await activityBuffer.flush();

      expect(createMany).not.toHaveBeenCalled();
    });

    it('skips unparseable entries instead of throwing', async () => {
      jest.spyOn(redis, 'lpop').mockResolvedValue(['not-json', JSON.stringify({ ...input, createdAt: '2026-08-08T00:00:00.000Z' })] as any);
      const prisma = await import('../../src/config/prisma');
      const createMany = jest
        .spyOn(prisma.prisma.userActivity, 'createMany')
        .mockResolvedValue({ count: 1 });

      await expect(activityBuffer.flush()).resolves.not.toThrow();
      expect(createMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ userId: input.userId })]) })
      );
    });
  });

  describe('startFlushTimer', () => {
    it('starts the timer once even if called twice', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      activityBuffer.startFlushTimer();
      activityBuffer.startFlushTimer();
      expect(setIntervalSpy).toHaveBeenCalledTimes(1);
      jest.spyOn(redis, 'llen').mockResolvedValue(0);
      return activityBuffer.stopFlushTimer();
    });
  });
});
