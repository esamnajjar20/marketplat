import { atomicRefreshRotate, hashToken, RotateResult } from '../../src/shared/utils/refreshLock';
import { redis } from '../../src/config/redis';

/**
 * Coverage for refreshLock.ts — the atomic compare-and-swap Lua script
 * that rotates a refresh token. This is the mechanism that prevents a
 * stolen/replayed refresh token from being used concurrently with the
 * legitimate one (the classic refresh-token-reuse race). The mock for
 * ROTATE_SCRIPT already exists in tests/setup.ts (see the
 * `"'TOKEN_MISMATCH'"` branch) — this file exercises it directly rather
 * than only indirectly through auth.service tests.
 */
describe('refreshLock', () => {
  afterEach(async () => {
    (redis as any).__clear();
  });

  describe('hashToken', () => {
    it('produces a deterministic sha256 hex digest', () => {
      const a = hashToken('my-refresh-token');
      const b = hashToken('my-refresh-token');
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it('produces different hashes for different inputs', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
    });
  });

  describe('atomicRefreshRotate', () => {
    const userId = 'user-1';
    const sessionId = 'session-1';

    it('returns TOKEN_NOT_FOUND when no token is stored for the session', async () => {
      const result = await atomicRefreshRotate(userId, sessionId, 'old-token', 'new-token');
      expect(result).toBe(RotateResult.TOKEN_NOT_FOUND);
    });

    it('returns SUCCESS and rotates the stored hash when the old token matches', async () => {
      // Seed the store with the hash of the "old" token, exactly as
      // tokenStore.saveRefreshToken would have done.
      await redis.setex(`refresh:${userId}:${sessionId}`, 604800, hashToken('old-token'));

      const result = await atomicRefreshRotate(userId, sessionId, 'old-token', 'new-token');
      expect(result).toBe(RotateResult.SUCCESS);

      // The stored value must now be the NEW token's hash, not the old one.
      const stored = await redis.get(`refresh:${userId}:${sessionId}`);
      expect(stored).toBe(hashToken('new-token'));
    });

    it('returns TOKEN_MISMATCH when the supplied old token does not match what is stored (replay/theft detection)', async () => {
      await redis.setex(`refresh:${userId}:${sessionId}`, 604800, hashToken('real-token'));

      const result = await atomicRefreshRotate(userId, sessionId, 'attacker-guessed-token', 'new-token');
      expect(result).toBe(RotateResult.TOKEN_MISMATCH);

      // Crucially, a mismatched rotation attempt must NOT overwrite the
      // legitimately stored token — the real session must stay valid.
      const stored = await redis.get(`refresh:${userId}:${sessionId}`);
      expect(stored).toBe(hashToken('real-token'));
    });

    it('returns REDIS_ERROR when the eval call throws', async () => {
      // BUGFIX (found while re-verifying this suite): the previous
      // version used jest.spyOn(redis, 'eval').mockRestore(). redis.eval
      // is already a jest.fn() (defined in tests/setup.ts), not a real
      // object method — spying on a mock and later restoring it does
      // not reliably hand back the original implementation, which
      // caused the next test in this file to intermittently see eval()
      // resolve to `undefined`. Calling mockRejectedValueOnce directly
      // on the existing jest.fn() needs no spy/restore lifecycle at
      // all: it consumes itself after one call and the mock's real
      // implementation (from tests/setup.ts) is untouched throughout.
      (redis as any).eval.mockRejectedValueOnce(new Error('connection lost'));

      const result = await atomicRefreshRotate(userId, sessionId, 'old-token', 'new-token');
      expect(result).toBe(RotateResult.REDIS_ERROR);
    });

    // BUGFIX (found while re-verifying this suite): this test's own
    // name/comment claimed to simulate concurrent callers, but the
    // previous version awaited each atomicRefreshRotate call in turn —
    // genuinely sequential, not concurrent at all. Dispatches both
    // calls with no `await` between them so they actually interleave
    // against the shared mock store, matching what the test claims to
    // exercise.
    it('two concurrent rotations with the same old token: only one can succeed against the new hash', async () => {
      await redis.setex(`refresh:${userId}:${sessionId}`, 604800, hashToken('old-token'));

      const firstPromise = atomicRefreshRotate(userId, sessionId, 'old-token', 'new-token-1');
      const secondPromise = atomicRefreshRotate(userId, sessionId, 'old-token', 'new-token-2');
      const [first, second] = await Promise.all([firstPromise, secondPromise]);

      // Exactly one of the two must see the original hash and succeed;
      // the other must see the already-rotated value and mismatch.
      // Since the mock store applies eval calls in the order they're
      // invoked (no artificial delay), the first dispatched call wins —
      // a real Redis server's atomicity guarantee is what this test
      // stands in for.
      expect([first, second]).toEqual(
        expect.arrayContaining([RotateResult.SUCCESS, RotateResult.TOKEN_MISMATCH])
      );

      const stored = await redis.get(`refresh:${userId}:${sessionId}`);
      // Whichever call actually succeeded is the one whose new hash
      // must be stored.
      const successIsFirst = first === RotateResult.SUCCESS;
      expect(stored).toBe(hashToken(successIsFirst ? 'new-token-1' : 'new-token-2'));
    });
  });
});
