import { withServiceProviderCreationLock } from '../../src/shared/utils/serviceProviderLock';
import { ConflictError } from '../../src/shared/errors/ConflictError';

describe('serviceProviderLock / withServiceProviderCreationLock', () => {
  it('runs the wrapped function when the lock is free', async () => {
    await expect(
      withServiceProviderCreationLock('sp-1', async () => 'created'),
    ).resolves.toBe('created');
  });

  it('releases after success', async () => {
    await withServiceProviderCreationLock('sp-1', async () => 'a');
    await expect(withServiceProviderCreationLock('sp-1', async () => 'b')).resolves.toBe('b');
  });

  it('releases on throw', async () => {
    await expect(
      withServiceProviderCreationLock('sp-1', async () => {
        throw new Error('fail');
      }),
    ).rejects.toThrow('fail');
    await expect(withServiceProviderCreationLock('sp-1', async () => 'ok')).resolves.toBe('ok');
  });

  it('rejects concurrent same sellerProfileId with ConflictError', async () => {
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      void withServiceProviderCreationLock('sp-2', async () => {
        resolve();
        await new Promise<void>((r) => {
          release = r;
        });
        return 'first';
      });
    });
    await started;
    await expect(
      withServiceProviderCreationLock('sp-2', async () => 'second'),
    ).rejects.toBeInstanceOf(ConflictError);
    release();
  });

  it('allows concurrent different sellerProfileIds', async () => {
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      void withServiceProviderCreationLock('sp-3', async () => {
        resolve();
        await new Promise<void>((r) => {
          release = r;
        });
        return 'first';
      });
    });
    await started;
    await expect(
      withServiceProviderCreationLock('sp-4', async () => 'other'),
    ).resolves.toBe('other');
    release();
  });
});
