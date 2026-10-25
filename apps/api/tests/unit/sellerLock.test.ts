import { withSellerProfileCreationLock } from '../../src/shared/utils/sellerLock';
import { ConflictError } from '../../src/shared/errors/ConflictError';

describe('sellerLock / withSellerProfileCreationLock', () => {
  it('runs the wrapped function and returns its result when the lock is free', async () => {
    const result = await withSellerProfileCreationLock('user-1', async () => 'created');
    expect(result).toBe('created');
  });

  it('releases the lock after the wrapped function completes, allowing a subsequent call to acquire it', async () => {
    await withSellerProfileCreationLock('user-1', async () => 'first');
    const result = await withSellerProfileCreationLock('user-1', async () => 'second');
    expect(result).toBe('second');
  });

  it('releases the lock even when the wrapped function throws, allowing a subsequent call to acquire it', async () => {
    await expect(
      withSellerProfileCreationLock('user-1', async () => {
        throw new Error('transaction failed');
      })
    ).rejects.toThrow('transaction failed');

    // If the lock weren't released on the error path, this would throw
    // ConflictError instead of completing normally.
    const result = await withSellerProfileCreationLock('user-1', async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('rejects a concurrent call for the same userId while the lock is held, with ConflictError', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>(resolveStarted => {
      void withSellerProfileCreationLock('user-2', async () => {
        resolveStarted();
        await new Promise<void>(resolve => {
          releaseFirst = resolve;
        });
        return 'first';
      });
    });

    await firstCallStarted;

    await expect(withSellerProfileCreationLock('user-2', async () => 'second')).rejects.toBeInstanceOf(
      ConflictError
    );

    releaseFirst!();
  });

  it('does not block a concurrent call for a different userId', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>(resolveStarted => {
      void withSellerProfileCreationLock('user-3', async () => {
        resolveStarted();
        await new Promise<void>(resolve => {
          releaseFirst = resolve;
        });
        return 'first';
      });
    });

    await firstCallStarted;

    const result = await withSellerProfileCreationLock('user-4', async () => 'second');
    expect(result).toBe('second');

    releaseFirst!();
  });
});
