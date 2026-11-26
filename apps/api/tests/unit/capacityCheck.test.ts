import os from 'os';
import { checkConnectionCapacity } from '../../src/shared/observability/capacityCheck';
import { logger } from '../../src/shared/observability/logger';

/**
 * coverage: checkConnectionCapacity is the only piece of
 * code in the repo that actually computes
 * (PM2 instances × Prisma connection_limit) against Postgres's default
 * max_connections, rather than leaving the relationship as a comment
 * for a human to notice. Covers: missing connection_limit, safe
 * configuration, and the over-capacity warning path, across both an
 * explicit PM2_INSTANCES and the os.cpus()-based fallback.
 */
describe('checkConnectionCapacity', () => {
  const originalPm2Instances = process.env.PM2_INSTANCES;
  const originalDbPoolInstances = process.env.DB_POOL_INSTANCES;
  const originalOtherConnections = process.env.DB_OTHER_CONNECTIONS;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalPm2Instances === undefined) delete process.env.PM2_INSTANCES;
    else process.env.PM2_INSTANCES = originalPm2Instances;
    if (originalDbPoolInstances === undefined) delete process.env.DB_POOL_INSTANCES;
    else process.env.DB_POOL_INSTANCES = originalDbPoolInstances;
    if (originalOtherConnections === undefined) delete process.env.DB_OTHER_CONNECTIONS;
    else process.env.DB_OTHER_CONNECTIONS = originalOtherConnections;
  });

  it('warns when connection_limit is absent from DATABASE_URL', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db', 20);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no explicit connection_limit'));
  });

  it('logs an info message (not a warning) when estimated total connections are within the safe threshold', () => {
    process.env.PM2_INSTANCES = '2';
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    // 2 instances × connection_limit=10 = 20, well under the
    // (200 - 6 margin) = 194 threshold.
    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=10', 200);

    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('capacity check passed'));
  });

  it('warns when estimated total connections exceed the safe threshold, using an explicit PM2_INSTANCES', () => {
    process.env.PM2_INSTANCES = '10';
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    // 10 instances × connection_limit=20 = 200, exceeds (200 - 6) = 194.
    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=20', 200);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('may exceed'),
      expect.objectContaining({ instances: 10, connectionLimit: 20, estimatedTotal: 200 }),
    );
  });

  it('uses the same two-worker default as ecosystem.config.js when PM2_INSTANCES is unset', () => {
    delete process.env.PM2_INSTANCES;
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    // 2 default PM2 workers × connection_limit=20 = 40, below 194.
    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=20', 200);

    expect(warnSpy).not.toHaveBeenCalled();
  });


  it('uses DB_POOL_INSTANCES to account for Node processes across separate API services', () => {
    delete process.env.PM2_INSTANCES;
    process.env.DB_POOL_INSTANCES = '8';
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=2', 20);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('may exceed'),
      expect.objectContaining({
        instances: 8,
        connectionLimit: 2,
        estimatedNodeTotal: 16,
        estimatedOtherConnections: 2,
        estimatedTotal: 18,
      })
    );
  });

  it('includes non-Prisma Go/worker pools in the aggregate connection budget', () => {
    process.env.PM2_INSTANCES = '8';
    process.env.DB_OTHER_CONNECTIONS = '7';
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=1', 20);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('may exceed'),
      expect.objectContaining({
        estimatedNodeTotal: 8,
        estimatedOtherConnections: 7,
        estimatedTotal: 15,
      })
    );
  });

  it('warns and falls back when DB_POOL_INSTANCES is malformed', () => {
    process.env.DB_POOL_INSTANCES = 'many';
    process.env.PM2_INSTANCES = '2';
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=1', 20);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('DB_POOL_INSTANCES must be an integer')
    );
  });

  it('uses CPU count only when PM2_INSTANCES is explicitly max', () => {
    process.env.PM2_INSTANCES = 'max';
    jest.spyOn(os, 'cpus').mockReturnValue(new Array(4).fill({}) as os.CpuInfo[]);
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => logger);

    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=5', 200);

    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('4 instances'));
  });

  it('treats a malformed DATABASE_URL as "no connection_limit" rather than throwing', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    expect(() => checkConnectionCapacity('not a valid url', 20)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no explicit connection_limit'));
  });

  it('treats a non-numeric connection_limit value as absent rather than producing NaN math', () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    checkConnectionCapacity('postgresql://user:pass@localhost:5432/db?connection_limit=abc', 20);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no explicit connection_limit'));
  });
});
