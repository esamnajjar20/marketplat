import { viewsBuffer } from '../../src/shared/utils/viewsBuffer';
import { redis } from '../../src/config/redis';

describe('viewsBuffer', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns false when viewer already seen', async () => {
    jest.spyOn(redis, 'exists').mockResolvedValue(1);
    const result = await viewsBuffer.increment('ad-1', '127.0.0.1');
    expect(result).toBe(false);
  });

  it('increments buffer for new viewer', async () => {
    jest.spyOn(redis, 'exists').mockResolvedValue(0);
    jest.spyOn(redis, 'setex').mockResolvedValue('OK');
    jest.spyOn(redis, 'incr').mockResolvedValue(1);

    const result = await viewsBuffer.increment('ad-1', '127.0.0.1');
    expect(result).toBe(true);
    expect(redis.incr).toHaveBeenCalled();
  });

  it('returns false when redis fails', async () => {
    jest.spyOn(redis, 'exists').mockRejectedValue(new Error('redis down'));
    const result = await viewsBuffer.increment('ad-1', '127.0.0.1');
    expect(result).toBe(false);
  });

  it('starts flush timer once', () => {
    viewsBuffer.startFlushTimer();
    viewsBuffer.startFlushTimer();
    viewsBuffer.stopFlushTimer();
  });

  it('flushes buffered views atomically via GETDEL script', async () => {
    const evalMock = jest.spyOn(redis as any, 'eval').mockResolvedValue(['3']);
    jest.spyOn(redis as any, 'scan').mockResolvedValue(['0', ['views_buffer:ad-1']] as [string, string[]]);

    const prisma = await import('../../src/config/prisma');
    const updateMany = jest
      .spyOn(prisma.prisma.ad, 'updateMany')
      .mockResolvedValue({ count: 1 });

    await viewsBuffer.flush();

    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining('GETDEL'),
      1,
      'views_buffer:ad-1'
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'ad-1', status: { not: 'DELETED' } },
      data: { views: { increment: 3 } },
    });
  });
});
