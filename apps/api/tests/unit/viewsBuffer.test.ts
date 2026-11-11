import { viewsBuffer } from '../../src/shared/buffers/viewsBuffer';
import { redis } from '../../src/config/redis';
import { prisma } from '../../src/config/prisma';

describe('viewsBuffer', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await (redis as any).flushall();
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns false when viewer already seen', async () => {
    jest.spyOn(redis as any, 'eval').mockResolvedValue(0);
    await expect(viewsBuffer.increment('ad-1', '127.0.0.1')).resolves.toBe(false);
  });

  it('atomically deduplicates and increments the buffer for a new viewer', async () => {
    const evalSpy = jest.spyOn(redis as any, 'eval');
    jest.spyOn(prisma.ad, 'updateMany').mockResolvedValue({ count: 1 });
    await expect(viewsBuffer.increment('ad-1', '127.0.0.1')).resolves.toBe(true);
    expect(evalSpy).toHaveBeenCalledWith(
      expect.stringContaining('VIEWS_DEDUP_INCREMENT'),
      2,
      'views_buffer:ad-1',
      'views_dedup:ad-1:127.0.0.1',
      '1',
      '3600',
      '86400'
    );
  });

  it('returns false when Redis fails', async () => {
    jest.spyOn(redis as any, 'eval').mockRejectedValue(new Error('redis down'));
    await expect(viewsBuffer.increment('ad-1', '127.0.0.1')).resolves.toBe(false);
  });

  it('does not count a duplicate viewer when the atomic script declines the claim', async () => {
    jest.spyOn(redis as any, 'eval').mockResolvedValue(0);
    await expect(viewsBuffer.increment('ad-1', '127.0.0.1')).resolves.toBe(false);
  });

  it('starts flush timer once', async () => {
    const transaction = jest.spyOn(prisma as any, '$transaction').mockImplementation(async (callback: any) =>
      callback({ $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]) })
    );
    viewsBuffer.startFlushTimer();
    viewsBuffer.startFlushTimer();
    await viewsBuffer.stopFlushTimer();
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('stages a view batch before deleting counters and commits it with a durable receipt', async () => {
    const evalMock = jest.spyOn(redis as any, 'eval');
    const scan = jest.spyOn(redis as any, 'scan').mockResolvedValue(['0', ['views_buffer:ad-1']] as [string, string[]]);
    const transaction = jest.spyOn(prisma as any, '$transaction').mockImplementation(async (callback: any) =>
      callback({
        $queryRaw: jest.fn().mockResolvedValue([{ id: 'api-batch-1' }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      })
    );
    const hdel = jest.spyOn(redis as any, 'hdel');
    await (redis as any).set('views_buffer:ad-1', '3');

    await viewsBuffer.flush();

    expect(scan).toHaveBeenCalledWith('0', 'MATCH', 'views_buffer:*', 'COUNT', 100);
    expect(evalMock).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('HSET', pendingKey"),
      2,
      'views_buffer:ad-1',
      'views_buffer:inflight',
      expect.stringMatching(/^api_/),
      'views_buffer:'
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(hdel).toHaveBeenCalledWith('views_buffer:inflight', expect.stringMatching(/^api_/));
  });

  it('keeps staged inflight data when the database transaction fails', async () => {
    jest.spyOn(redis as any, 'scan').mockResolvedValue(['0', ['views_buffer:ad-fail']] as [string, string[]]);
    jest.spyOn(prisma as any, '$transaction').mockRejectedValue(new Error('database unavailable'));
    const hdel = jest.spyOn(redis as any, 'hdel');
    await (redis as any).set('views_buffer:ad-fail', '5');

    await expect(viewsBuffer.flush()).rejects.toThrow('database unavailable');
    expect(hdel).not.toHaveBeenCalled();
    expect(await (redis as any).hscan('views_buffer:inflight', '0', 'COUNT', '25')).toEqual([
      '0',
      expect.arrayContaining([
        expect.stringMatching(/^api_/),
        expect.stringContaining('"count":5'),
      ]),
    ]);
  });

  it('does not start a second flush while the first scan is still pending', async () => {
    let resolveScan!: (value: [string, string[]]) => void;
    jest.spyOn(redis as any, 'hscan').mockResolvedValue(['0', []] as [string, string[]]);
    const scan = jest.spyOn(redis as any, 'scan').mockReturnValue(
      new Promise<[string, string[]]>(resolve => { resolveScan = resolve; })
    );
    const first = viewsBuffer.flush();
    const second = viewsBuffer.flush();
    await Promise.resolve();
    expect(scan).toHaveBeenCalledTimes(1);
    resolveScan(['0', []]);
    await Promise.all([first, second]);
  });
});
