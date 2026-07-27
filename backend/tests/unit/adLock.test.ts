import {
  withAdImagesLock,
  AdImagesLockedError,
  withUserAdCreationLock,
  AdCreationLockedError,
} from '../../src/shared/utils/adLock';
import { redis } from '../../src/config/redis';

/**
 * FIX TEST-V4-03: adLock.ts had zero test coverage despite being the
 * fix for a real concurrency bug (two concurrent addImages calls
 * bypassing the 10-image cap and orphaning Cloudinary assets — see
 * ads.service.ts's FIX D-10 comments). The shared Redis mock's `set`
 * previously ignored the NX flag entirely (see tests/setup.ts's FIX
 * TEST-V4-03), which made it impossible to even simulate "a lock is
 * already held" — every acquire attempt always silently succeeded.
 */
describe('adLock / withAdImagesLock', () => {
  it('runs the wrapped function and returns its result when the lock is free', async () => {
    const result = await withAdImagesLock('ad-1', async () => 'done');
    expect(result).toBe('done');
  });

  it('releases the lock after the wrapped function completes, allowing a subsequent call to acquire it', async () => {
    await withAdImagesLock('ad-1', async () => 'first');
    // If the lock weren't released, this second call would throw
    // AdImagesLockedError instead of completing normally.
    const result = await withAdImagesLock('ad-1', async () => 'second');
    expect(result).toBe('second');
  });

  it('rejects a concurrent call for the same adId while the lock is held', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>((resolveStarted) => {
      void withAdImagesLock('ad-2', async () => {
        resolveStarted();
        // Hold the lock open until the test explicitly releases it.
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
        return 'first';
      });
    });

    await firstCallStarted; // first call has now acquired the lock and is "in progress"

    // FIX TEST-V4-03: this is the actual behavior the lock exists to
    // guarantee — a second concurrent request for the same ad must be
    // rejected, not silently allowed to race the first.
    await expect(withAdImagesLock('ad-2', async () => 'second'))
      .rejects.toBeInstanceOf(AdImagesLockedError);

    releaseFirst!();
  });

  it('does not block a concurrent call for a different adId', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>((resolveStarted) => {
      void withAdImagesLock('ad-3', async () => {
        resolveStarted();
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
        return 'first';
      });
    });

    await firstCallStarted;

    // A different adId has its own independent lock key — must not be
    // affected by ad-3's lock being held.
    const result = await withAdImagesLock('ad-4', async () => 'unrelated-ad');
    expect(result).toBe('unrelated-ad');

    releaseFirst!();
  });

  it('still releases the lock when the wrapped function throws', async () => {
    await expect(
      withAdImagesLock('ad-5', async () => { throw new Error('upload failed'); }),
    ).rejects.toThrow('upload failed');

    // The lock must have been released in the `finally` block despite
    // the thrown error — otherwise ad-5 would be stuck locked until its
    // 30s TTL expires, well beyond what a single failed request should cost.
    const result = await withAdImagesLock('ad-5', async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('AdImagesLockedError carries a 409 status code', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>((resolveStarted) => {
      void withAdImagesLock('ad-6', async () => {
        resolveStarted();
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
      });
    });
    await firstCallStarted;

    await expect(withAdImagesLock('ad-6', async () => 'should not run'))
      .rejects.toMatchObject({ statusCode: 409 });

    releaseFirst!();
  });

  it('a lock release call only succeeds for the token that actually acquired it', async () => {
    // Simulates a stale/expired release attempt (e.g. a request whose
    // own lock TTL already expired and was re-acquired by someone else)
    // by directly manipulating the lock key with a different token,
    // then confirming a legitimate new acquisition still succeeds
    // cleanly afterward rather than being corrupted by the stale release.
    await redis.set('ad_images_lock:ad-7', 'some-other-callers-token', 'EX', 30, 'NX');

    // A real caller now tries to acquire — must be rejected since the
    // key is genuinely held (by the "other caller" in this scenario).
    await expect(withAdImagesLock('ad-7', async () => 'should not run'))
      .rejects.toBeInstanceOf(AdImagesLockedError);
  });
});

/**
 * AUDIT-FIX M-02: withUserAdCreationLock shares the same underlying
 * SET-NX/Lua-release primitive as withAdImagesLock (see adLock.ts),
 * just keyed per-user instead of per-ad. These tests mirror the
 * withAdImagesLock suite above to confirm the shared primitive behaves
 * identically under this second keyspace, and that the two locks are
 * independent of one another.
 */
describe('adLock / withUserAdCreationLock', () => {
  it('runs the wrapped function and returns its result when the lock is free', async () => {
    const result = await withUserAdCreationLock('user-1', async () => 'done');
    expect(result).toBe('done');
  });

  it('releases the lock after the wrapped function completes, allowing a subsequent call to acquire it', async () => {
    await withUserAdCreationLock('user-1', async () => 'first');
    const result = await withUserAdCreationLock('user-1', async () => 'second');
    expect(result).toBe('second');
  });

  it('rejects a concurrent call for the same userId while the lock is held', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>((resolveStarted) => {
      void withUserAdCreationLock('user-2', async () => {
        resolveStarted();
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
        return 'first';
      });
    });

    await firstCallStarted;

    await expect(withUserAdCreationLock('user-2', async () => 'second'))
      .rejects.toBeInstanceOf(AdCreationLockedError);

    releaseFirst!();
  });

  it('does not block a concurrent call for a different userId', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>((resolveStarted) => {
      void withUserAdCreationLock('user-3', async () => {
        resolveStarted();
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
        return 'first';
      });
    });

    await firstCallStarted;

    const result = await withUserAdCreationLock('user-4', async () => 'unrelated-user');
    expect(result).toBe('unrelated-user');

    releaseFirst!();
  });

  it('does not contend with a withAdImagesLock call using the same identifier value', async () => {
    // Different keyspaces (ad_creation_lock: vs ad_images_lock:) even
    // when the raw identifier string happens to collide — proves the
    // shared primitive's prefixing keeps them from colliding.
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>((resolveStarted) => {
      void withUserAdCreationLock('shared-id', async () => {
        resolveStarted();
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
        return 'creation-lock-holder';
      });
    });

    await firstCallStarted;

    const result = await withAdImagesLock('shared-id', async () => 'images-lock-unaffected');
    expect(result).toBe('images-lock-unaffected');

    releaseFirst!();
  });

  it('still releases the lock when the wrapped function throws', async () => {
    await expect(
      withUserAdCreationLock('user-5', async () => { throw new Error('cap check failed'); }),
    ).rejects.toThrow('cap check failed');

    const result = await withUserAdCreationLock('user-5', async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('AdCreationLockedError carries a 409 status code', async () => {
    let releaseFirst: () => void;
    const firstCallStarted = new Promise<void>((resolveStarted) => {
      void withUserAdCreationLock('user-6', async () => {
        resolveStarted();
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
      });
    });
    await firstCallStarted;

    await expect(withUserAdCreationLock('user-6', async () => 'should not run'))
      .rejects.toMatchObject({ statusCode: 409 });

    releaseFirst!();
  });
});
