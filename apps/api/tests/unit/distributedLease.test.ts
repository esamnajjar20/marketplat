import type Redis from 'ioredis';
import { withDistributedLease } from '../../src/shared/jobs/distributedLease';

describe('withDistributedLease', () => {
  const makeRedis = (setResult: string | null = 'OK') => {
    const redis = {
      set: jest.fn().mockResolvedValue(setResult),
      eval: jest.fn().mockResolvedValue(1),
    };
    return redis as unknown as Redis & { set: jest.Mock; eval: jest.Mock };
  };

  it('runs the task and releases only its own lease', async () => {
    const redis = makeRedis();
    const task = jest.fn().mockResolvedValue('done');

    const result = await withDistributedLease(redis, 'lease:test', task);

    expect(result).toEqual({ acquired: true, value: 'done' });
    expect(task).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith(
      'lease:test',
      expect.any(String),
      'PX',
      15_000,
      'NX'
    );
    expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining("redis.call('DEL'"), 1, 'lease:test', expect.any(String));
  });

  it('does not run the task when another process owns the lease', async () => {
    const redis = makeRedis(null);
    const task = jest.fn();

    const result = await withDistributedLease(redis, 'lease:test', task);

    expect(result).toEqual({ acquired: false });
    expect(task).not.toHaveBeenCalled();
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it('releases the lease when the task fails', async () => {
    const redis = makeRedis();
    const task = jest.fn().mockRejectedValue(new Error('task failed'));

    await expect(withDistributedLease(redis, 'lease:test', task)).rejects.toThrow('task failed');
    expect(redis.eval).toHaveBeenCalledTimes(1);
  });
});
