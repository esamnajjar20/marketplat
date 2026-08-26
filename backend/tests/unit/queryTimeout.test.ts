import { Prisma } from '@prisma/client';
import {
  runWithQueryTimeout,
  AnalyticsQueryTimeoutError,
} from '../../src/shared/utils/queryTimeout';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

describe('runWithQueryTimeout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runs fn inside a transaction after setting statement_timeout', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const queryResult = { ok: true };
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
      const tx = { $executeRawUnsafe: executeRaw };
      return cb(tx);
    });

    const result = await runWithQueryTimeout(async () => queryResult, 5000);
    expect(executeRaw).toHaveBeenCalledWith('SET LOCAL statement_timeout = 5000');
    expect(result).toEqual(queryResult);
  });

  it('clamps non-finite timeout to default 10000', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => {
      await cb({ $executeRawUnsafe: executeRaw });
      return null;
    });
    await runWithQueryTimeout(async () => null, Number.NaN);
    expect(executeRaw).toHaveBeenCalledWith('SET LOCAL statement_timeout = 10000');
  });

  it('translates Postgres 57014 into AnalyticsQueryTimeoutError', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('query_canceled', {
      code: 'P2010',
      clientVersion: 'test',
      meta: { code: '57014' },
    });
    (prisma.$transaction as jest.Mock).mockRejectedValue(err);

    await expect(runWithQueryTimeout(async () => null, 1000)).rejects.toBeInstanceOf(
      AnalyticsQueryTimeoutError,
    );
  });

  it('rethrows non-timeout errors', async () => {
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('disk full'));
    await expect(runWithQueryTimeout(async () => null)).rejects.toThrow('disk full');
  });
});
