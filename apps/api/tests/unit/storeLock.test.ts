import { withStoreCreationLock } from '../../src/shared/utils/storeLock';
import { ConflictError } from '../../src/shared/errors/ConflictError';

describe('storeLock / withStoreCreationLock', () => {
  it('runs the wrapped function when the lock is free', async () => {
    await expect(withStoreCreationLock('sp-1', async () => 'created')).resolves.toBe('created');
  });

  it('releases the lock after success so a later call can acquire it', async () => {
    await withStoreCreationLock('sp-1', async () => 'first');
    await expect(withStoreCreationLock('sp-1', async () => 'second')).resolves.toBe('second');
  });

  it('releases the lock when the function throws', async () => {
    await expect(
      withStoreCreationLock('sp-1', async () => {
        throw new Error('tx failed');
      }),
    ).rejects.toThrow('tx failed');

    await expect(withStoreCreationLock('sp-1', async () => 'ok')).resolves.toBe('ok');
  });

  it('rejects a concurrent call for the same sellerProfileId with ConflictError', async () => {
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      void withStoreCreationLock('sp-2', async () => {
        resolve();
        await new Promise<void>((r) => {
          release = r;
        });
        return 'first';
      });
    });
    await started;
    await expect(withStoreCreationLock('sp-2', async () => 'second')).rejects.toBeInstanceOf(
      ConflictError,
    );
    release();
  });

  it('does not block a concurrent call for a different sellerProfileId', async () => {
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      void withStoreCreationLock('sp-3', async () => {
        resolve();
        await new Promise<void>((r) => {
          release = r;
        });
        return 'first';
      });
    });
    await started;
    await expect(withStoreCreationLock('sp-4', async () => 'other')).resolves.toBe('other');
    release();
  });
});
