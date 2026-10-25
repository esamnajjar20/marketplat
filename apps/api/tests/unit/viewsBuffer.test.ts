import { viewsBuffer } from '../../src/shared/utils/viewsBuffer';
import { redis } from '../../src/config/redis';

describe('viewsBuffer', () => {
  // redis.scan is a shared jest.fn from tests/setup.ts: earlier tests (and the
  // shutdown flush in stopFlushTimer) leave calls on it, so clear call history
  // before each test or call-count assertions see stale calls.
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it('returns false when viewer already seen', async () => {
    jest.spyOn(redis as any, 'eval').mockResolvedValue(0);
    const result = await viewsBuffer.increment('ad-1', '127.0.0.1');
    expect(result).toBe(false);
  });

  it('atomically deduplicates and increments the buffer for a new viewer', async () => {
    const evalSpy = jest.spyOn(redis as any, 'eval');
    const prisma = await import('../../src/config/prisma');
    jest.spyOn(prisma.prisma.ad, 'updateMany').mockResolvedValue({ count: 1 });
    const result = await viewsBuffer.increment('ad-1', '127.0.0.1');
    expect(result).toBe(true);
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

  it('returns false when redis fails', async () => {
    jest.spyOn(redis as any, 'eval').mockRejectedValue(new Error('redis down'));
    const result = await viewsBuffer.increment('ad-1', '127.0.0.1');
    expect(result).toBe(false);
  });

  it('does not count a duplicate viewer when the atomic script declines the claim', async () => {
    jest.spyOn(redis as any, 'eval').mockResolvedValue(0);
    const result = await viewsBuffer.increment('ad-1', '127.0.0.1');
    expect(result).toBe(false);
  });

  it('starts flush timer once', async () => {
    viewsBuffer.startFlushTimer();
    viewsBuffer.startFlushTimer();
    // stopFlushTimer performs a final flush; await it so it cannot leak into later tests.
    await viewsBuffer.stopFlushTimer();
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

  it('restores drained views with an atomic counter increment and TTL when the DB write fails', async () => {
    const evalMock = jest
      .spyOn(redis as any, 'eval')
      .mockResolvedValueOnce(['3'])
      .mockResolvedValueOnce(3);
    jest.spyOn(redis as any, 'scan').mockResolvedValue(['0', ['views_buffer:ad-restore']] as [string, string[]]);

    const prisma = await import('../../src/config/prisma');
    jest.spyOn(prisma.prisma.ad, 'updateMany').mockRejectedValue(new Error('database unavailable'));

    await viewsBuffer.flush();

    expect(evalMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('VIEWS_RESTORE_BUFFER'),
      1,
      'views_buffer:ad-restore',
      '3',
      '86400'
    );
  });

  it('does not start a second flush while the first scan is still pending', async () => {
    let resolveScan!: (value: [string, string[]]) => void;
    const scan = jest.spyOn(redis as any, 'scan').mockReturnValue(
      new Promise<[string, string[]]>((resolve) => { resolveScan = resolve; })
    );

    const first = viewsBuffer.flush();
    const second = viewsBuffer.flush();
    // flush() yields one microtask after installing its in-flight lock.
    await Promise.resolve();
    expect(scan).toHaveBeenCalledTimes(1);

    resolveScan(['0', []]);
    await Promise.all([first, second]);
  });

});
