import { withProviderScheduleLock } from '../../src/shared/utils/providerScheduleLock';
import { ConflictError } from '../../src/shared/errors/ConflictError';

describe('providerScheduleLock / withProviderScheduleLock', () => {
  it('runs the wrapped function when the lock is free', async () => {
    await expect(withProviderScheduleLock('p-1', async () => 'booked')).resolves.toBe('booked');
  });

  it('releases after success', async () => {
    await withProviderScheduleLock('p-1', async () => 'a');
    await expect(withProviderScheduleLock('p-1', async () => 'b')).resolves.toBe('b');
  });

  it('releases on throw', async () => {
    await expect(
      withProviderScheduleLock('p-1', async () => {
        throw new Error('overlap');
      }),
    ).rejects.toThrow('overlap');
    await expect(withProviderScheduleLock('p-1', async () => 'ok')).resolves.toBe('ok');
  });

  it('rejects concurrent same providerId with ConflictError', async () => {
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      void withProviderScheduleLock('p-2', async () => {
        resolve();
        await new Promise<void>((r) => {
          release = r;
        });
        return 'first';
      });
    });
    await started;
    await expect(withProviderScheduleLock('p-2', async () => 'second')).rejects.toBeInstanceOf(
      ConflictError,
    );
    release();
  });

  it('allows concurrent different providerIds', async () => {
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      void withProviderScheduleLock('p-3', async () => {
        resolve();
        await new Promise<void>((r) => {
          release = r;
        });
        return 'first';
      });
    });
    await started;
    await expect(withProviderScheduleLock('p-4', async () => 'other')).resolves.toBe('other');
    release();
  });
});
