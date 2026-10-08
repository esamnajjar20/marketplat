import { reportBackgroundFailure, runBackgroundTask, isTransientBackgroundError } from '../../src/shared/utils/backgroundTask';
import { logger } from '../../src/shared/utils/logger';
import { recordFailedTask } from '../../src/shared/utils/failedBackgroundTasks';

jest.mock('../../src/shared/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/shared/utils/failedBackgroundTasks', () => ({
  recordFailedTask: jest.fn().mockResolvedValue(undefined),
}));

describe('backgroundTask', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reports a background failure without throwing', () => {
    expect(() => reportBackgroundFailure('notifications.send', new Error('push failed'), { userId: 'u1' })).not.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      'Background task failed',
      expect.objectContaining({ context: 'notifications.send', message: 'push failed', userId: 'u1' }),
    );
  });

  it('normalizes non-Error rejection values', () => {
    reportBackgroundFailure('cache.refresh', 'boom');
    expect(logger.warn).toHaveBeenCalledWith(
      'Background task failed',
      expect.objectContaining({ context: 'cache.refresh', message: 'boom' }),
    );
  });

  it('retries transient failures and eventually succeeds', async () => {
    const task = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('redis down'), { code: 'ECONNRESET' }))
      .mockResolvedValueOnce('ok');

    await expect(runBackgroundTask('redis.write', task, { retries: 2, backoffMs: 1 })).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(2);
    expect(recordFailedTask).not.toHaveBeenCalled();
  });

  it('does not retry non-transient errors by default and records the final failure', async () => {
    const error = Object.assign(new Error('validation'), { status: 400 });
    const task = jest.fn().mockRejectedValue(error);

    await expect(runBackgroundTask('audit.write', task, {
      taskType: 'AUDIT_LOG_WRITE',
      payload: { event: 'LOGIN' },
      retries: 3,
    })).resolves.toBeUndefined();

    expect(task).toHaveBeenCalledTimes(1);
    expect(recordFailedTask).toHaveBeenCalledWith(
      'AUDIT_LOG_WRITE',
      expect.objectContaining({ context: 'audit.write', event: 'LOGIN' }),
      error,
    );
  });

  it('classifies common infrastructure failures as transient', () => {
    expect(isTransientBackgroundError(Object.assign(new Error('db'), { code: 'P1001' }))).toBe(true);
    expect(isTransientBackgroundError(Object.assign(new Error('rate'), { status: 429 }))).toBe(true);
    expect(isTransientBackgroundError(Object.assign(new Error('bad input'), { status: 400 }))).toBe(false);
  });
});
