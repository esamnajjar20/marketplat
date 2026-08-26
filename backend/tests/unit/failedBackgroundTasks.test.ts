import { recordFailedTask } from '../../src/shared/utils/failedBackgroundTasks';
import { prisma } from '../../src/config/prisma';
import { logger } from '../../src/shared/utils/logger';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    failedBackgroundTask: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn() },
}));

describe('recordFailedTask', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists taskType, payload, and error message', async () => {
    (prisma.failedBackgroundTask.create as jest.Mock).mockResolvedValue({ id: 't1' });
    await recordFailedTask('FRAUD_SCORE', { adId: 'a1' }, new Error('timeout'));
    expect(prisma.failedBackgroundTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskType: 'FRAUD_SCORE',
        errorMessage: 'timeout',
      }),
    });
  });

  it('stringifies non-Error failures', async () => {
    (prisma.failedBackgroundTask.create as jest.Mock).mockResolvedValue({});
    await recordFailedTask('NOTIFY', {}, 'plain');
    expect(prisma.failedBackgroundTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ errorMessage: 'plain' }),
    });
  });

  it('logs and swallows persistence failures', async () => {
    (prisma.failedBackgroundTask.create as jest.Mock).mockRejectedValue(new Error('db'));
    await expect(
      recordFailedTask('X', {}, new Error('orig')),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});
