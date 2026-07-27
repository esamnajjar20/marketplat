import os from 'os';
import { checkConnectionCapacity } from '../../src/shared/utils/capacityCheck';
import { logger } from '../../src/shared/utils/logger';

/**
 * FIX LOAD-01 coverage: checkConnectionCapacity is the only piece of
 * code in the repo that actually computes
 * (PM2 instances × Prisma connection_limit) against Postgres's default
 * max_connections, rather than leaving the relationship as a comment
 * for a human to notice. Covers: missing connection_limit, safe
 * configuration, and the over-capacity warning path, across both an
 * explicit PM2_INSTANCES and the os.cpus()-based fallback.
 */
describe('checkConnectionCapacity', () => {
  const originalPm2Instances = process.env.PM2_INSTANCES;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalPm2Instances === undefined) delete process.env.PM2_INSTANCES;
    else process.env.PM2_INSTANCES = originalPm2Instances;
  });

  it('warns when connection_limit is absent from DATABASE_URL', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no explicit connection_limit'));
  });

  it('logs an info message (not a warning) when estimated total connections are within the safe threshold', () => {
    process.env.PM2_INSTANCES = '2';
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    // 2 instances × connection_limit=10 = 20, well under the
    // (200 - 20 margin) = 180 threshold.
    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=10');

    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('capacity check passed'));
  });

  it('warns when estimated total connections exceed the safe threshold, using an explicit PM2_INSTANCES', () => {
    process.env.PM2_INSTANCES = '10';
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    // 10 instances × connection_limit=20 = 200, exceeds (200 - 20) = 180.
    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=20');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('may exceed'),
      expect.objectContaining({ instances: 10, connectionLimit: 20, estimatedTotal: 200 }),
    );
  });

  it('falls back to os.cpus().length when PM2_INSTANCES is unset — the same value PM2 itself uses to resolve "max"', () => {
    delete process.env.PM2_INSTANCES;
    jest.spyOn(os, 'cpus').mockReturnValue(new Array(16).fill({}) as os.CpuInfo[]);
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    // 16 (mocked cpu count) × connection_limit=20 = 320, well over threshold.
    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=20');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('may exceed'),
      expect.objectContaining({ instances: 16 }),
    );
  });

  it('ignores a non-numeric PM2_INSTANCES value and falls back to os.cpus().length', () => {
    process.env.PM2_INSTANCES = 'max';
    jest.spyOn(os, 'cpus').mockReturnValue(new Array(4).fill({}) as os.CpuInfo[]);
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=5');

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('4 instances'));
  });

  it('treats a malformed DATABASE_URL as "no connection_limit" rather than throwing', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    expect(() => checkConnectionCapacity('not a valid url')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no explicit connection_limit'));
  });

  it('treats a non-numeric connection_limit value as absent rather than producing NaN math', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=abc');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no explicit connection_limit'));
  });
});
