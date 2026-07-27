import { tokenStore, maskIp, MAX_SESSIONS_PER_USER } from '../../src/shared/utils/tokenStore';
import { redis } from '../../src/config/redis';

describe('tokenStore utilities', () => {
  describe('maskIp', () => {
    it('returns unknown unchanged', () => {
      expect(maskIp('unknown')).toBe('unknown');
    });

    it('masks IPv4 addresses', () => {
      expect(maskIp('192.168.1.100')).toBe('192.168.1.xxx');
    });

    it('masks IPv6 addresses', () => {
      expect(maskIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toMatch(/xxxx/);
    });

    it('returns unmodified non-standard ip strings', () => {
      expect(maskIp('localhost')).toBe('localhost');
    });
  });

  describe('saveRefreshToken / getAllSessions / deleteRefreshToken', () => {
    const userId = 'user-1';
    const metadata = {
      userAgent: 'jest-test-agent',
      rawIp: '203.0.113.5',
      ip: '203.0.113.5',
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    afterEach(async () => {
      (redis as any).__clear();
    });

    it('persists a session that getAllSessions can then list', async () => {
      await tokenStore.saveRefreshToken(userId, 'session-a', 'token-a', metadata);

      const sessions = await tokenStore.getAllSessions(userId);

      expect(sessions).toHaveLength(1);
      expect(sessions[0].sessionId).toBe('session-a');
      // FIX (pre-existing, GDPR): IP is masked before being stored,
      // never the raw IP.
      expect(sessions[0].ip).toBe('203.0.113.xxx');
    });

    it('validateRefreshToken returns true only for the matching token', async () => {
      await tokenStore.saveRefreshToken(userId, 'session-a', 'token-a', metadata);

      await expect(tokenStore.validateRefreshToken(userId, 'session-a', 'token-a'))
        .resolves.toBe(true);
      await expect(tokenStore.validateRefreshToken(userId, 'session-a', 'wrong-token'))
        .resolves.toBe(false);
    });

    it('deleteRefreshToken removes exactly the targeted session, leaving others intact', async () => {
      await tokenStore.saveRefreshToken(userId, 'session-a', 'token-a', metadata);
      await tokenStore.saveRefreshToken(userId, 'session-b', 'token-b', metadata);

      await tokenStore.deleteRefreshToken(userId, 'session-a');

      const sessions = await tokenStore.getAllSessions(userId);
      expect(sessions.map(s => s.sessionId)).toEqual(['session-b']);
      await expect(tokenStore.validateRefreshToken(userId, 'session-a', 'token-a'))
        .resolves.toBe(false);
    });
  });

  describe('deleteAllRefreshTokens (atomic — FIX AUDIT-V3-07)', () => {
    const userId = 'user-2';
    const metadata = {
      userAgent: 'jest-test-agent',
      rawIp: '203.0.113.9',
      ip: '203.0.113.9',
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    afterEach(async () => {
      (redis as any).__clear();
    });

    it('removes every session for the user in one call', async () => {
      await tokenStore.saveRefreshToken(userId, 'session-a', 'token-a', metadata);
      await tokenStore.saveRefreshToken(userId, 'session-b', 'token-b', metadata);
      await tokenStore.saveRefreshToken(userId, 'session-c', 'token-c', metadata);

      await tokenStore.deleteAllRefreshTokens(userId);

      const sessions = await tokenStore.getAllSessions(userId);
      expect(sessions).toEqual([]);
      await expect(tokenStore.validateRefreshToken(userId, 'session-a', 'token-a'))
        .resolves.toBe(false);
      await expect(tokenStore.validateRefreshToken(userId, 'session-b', 'token-b'))
        .resolves.toBe(false);
      await expect(tokenStore.validateRefreshToken(userId, 'session-c', 'token-c'))
        .resolves.toBe(false);
    });

    it('does not affect another user\'s sessions', async () => {
      await tokenStore.saveRefreshToken(userId, 'session-a', 'token-a', metadata);
      await tokenStore.saveRefreshToken('other-user', 'session-x', 'token-x', metadata);

      await tokenStore.deleteAllRefreshTokens(userId);

      await expect(tokenStore.validateRefreshToken('other-user', 'session-x', 'token-x'))
        .resolves.toBe(true);
    });

    it('is a no-op (does not throw) when the user has no sessions', async () => {
      await expect(tokenStore.deleteAllRefreshTokens('user-with-no-sessions'))
        .resolves.toBeUndefined();
    });
  });

  /**
   * BUGFIX regression test — found during a post-implementation code
   * audit. This behavior existed in SAVE_SESSION_SCRIPT
   * (tokenStore.ts's own Lua script — see the "if count >= maxSessions
   * then ... DEL oldest ... end" block) since before this audit, but
   * had NO test coverage anywhere in this suite: tests/setup.ts's Lua
   * mock previously ignored the eviction branch entirely and always
   * behaved as if there were no cap, so a real regression in this
   * protection (e.g. someone accidentally removing the eviction block
   * from the real script, or a future refactor breaking the maxSessions
   * comparison) would have shipped silently. Fixed both the mock (now
   * mirrors the real script's eviction logic) and added this test.
   */
  describe(`session cap (MAX_SESSIONS_PER_USER = ${MAX_SESSIONS_PER_USER})`, () => {
    const userId = 'user-session-cap';
    const metadata = {
      userAgent: 'jest-test-agent',
      rawIp: '203.0.113.20',
      ip: '203.0.113.20',
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    afterEach(async () => {
      (redis as any).__clear();
    });

    it(`evicts the oldest session once the ${MAX_SESSIONS_PER_USER}th session is added, keeping the count at the cap`, async () => {
      // Each saveRefreshToken call uses Date.now() as the zset score —
      // real, monotonically increasing timestamps (not a mocked clock)
      // are what determine "oldest" here, matching the real script's
      // own scoring. A tiny stagger avoids any same-millisecond ties
      // that could make "oldest" ambiguous on a very fast test runner.
      for (let i = 0; i < MAX_SESSIONS_PER_USER; i++) {
        await tokenStore.saveRefreshToken(userId, `session-${i}`, `token-${i}`, metadata);
        await new Promise((resolve) => setTimeout(resolve, 2));
      }

      let sessions = await tokenStore.getAllSessions(userId);
      expect(sessions).toHaveLength(MAX_SESSIONS_PER_USER);

      // One more login beyond the cap — the very first session
      // (session-0, the oldest) must be evicted to make room, not just
      // appended on top of an ever-growing list.
      await tokenStore.saveRefreshToken(userId, 'session-overflow', 'token-overflow', metadata);

      sessions = await tokenStore.getAllSessions(userId);
      expect(sessions).toHaveLength(MAX_SESSIONS_PER_USER);
      expect(sessions.map((s) => s.sessionId)).not.toContain('session-0');
      expect(sessions.map((s) => s.sessionId)).toContain('session-overflow');

      // The evicted session's actual refresh token must also be gone —
      // not just absent from the listing, but genuinely unusable.
      await expect(tokenStore.validateRefreshToken(userId, 'session-0', 'token-0'))
        .resolves.toBe(false);
    });

    it('does not evict anything while still under the cap', async () => {
      for (let i = 0; i < MAX_SESSIONS_PER_USER - 1; i++) {
        await tokenStore.saveRefreshToken(userId, `session-${i}`, `token-${i}`, metadata);
      }

      const sessions = await tokenStore.getAllSessions(userId);
      expect(sessions).toHaveLength(MAX_SESSIONS_PER_USER - 1);
      // The first session created is still present — nothing evicted yet.
      expect(sessions.map((s) => s.sessionId)).toContain('session-0');
    });
  });
});
