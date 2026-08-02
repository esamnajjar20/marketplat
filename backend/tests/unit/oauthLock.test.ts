import { withOAuthAccountResolutionLock } from '../../src/shared/utils/oauthLock';
import { ConflictError } from '../../src/shared/errors/ConflictError';

describe('oauthLock / withOAuthAccountResolutionLock', () => {
  it('runs the wrapped function and returns its result when the lock is free', async () => {
    const result = await withOAuthAccountResolutionLock('a@example.com', async () => 'resolved');
    expect(result).toBe('resolved');
  });

  it('releases the lock after the wrapped function completes, allowing a subsequent call to acquire it', async () => {
    await withOAuthAccountResolutionLock('b@example.com', async () => 'first');
    const result = await withOAuthAccountResolutionLock('b@example.com', async () => 'second');
    expect(result).toBe('second');
  });

  it('releases the lock even when the wrapped function throws, allowing a subsequent call to acquire it', async () => {
    await expect(
      withOAuthAccountResolutionLock('c@example.com', async () => {
        throw new Error('db error');
      })
    ).rejects.toThrow('db error');

    const result = await withOAuthAccountResolutionLock('c@example.com', async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('rejects a concurrent call for the same email while the lock is held, with ConflictError', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>(resolveStarted => {
      void withOAuthAccountResolutionLock('d@example.com', async () => {
        resolveStarted();
        await new Promise<void>(resolve => {
          releaseFirst = resolve;
        });
        return 'first';
      });
    });

    await firstCallStarted;

    await expect(
      withOAuthAccountResolutionLock('d@example.com', async () => 'second')
    ).rejects.toBeInstanceOf(ConflictError);

    releaseFirst!();
  });

  it('treats email case-insensitively (same lock key for different casing)', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>(resolveStarted => {
      void withOAuthAccountResolutionLock('MixedCase@Example.com', async () => {
        resolveStarted();
        await new Promise<void>(resolve => {
          releaseFirst = resolve;
        });
        return 'first';
      });
    });

    await firstCallStarted;

    await expect(
      withOAuthAccountResolutionLock('mixedcase@example.com', async () => 'second')
    ).rejects.toBeInstanceOf(ConflictError);

    releaseFirst!();
  });

  it('does not block a concurrent call for a different email', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>(resolveStarted => {
      void withOAuthAccountResolutionLock('e@example.com', async () => {
        resolveStarted();
        await new Promise<void>(resolve => {
          releaseFirst = resolve;
        });
        return 'first';
      });
    });

    await firstCallStarted;

    const result = await withOAuthAccountResolutionLock('f@example.com', async () => 'second');
    expect(result).toBe('second');

    releaseFirst!();
  });
});
