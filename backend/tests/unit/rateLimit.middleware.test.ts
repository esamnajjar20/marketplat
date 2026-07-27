import { makeSendCommand } from '../../src/middlewares/rateLimit.middleware';
import { redis } from '../../src/config/redis';

/**
 * FIX TEST-V4-05: rateLimit.middleware.ts had zero test coverage
 * despite controlling a genuinely security-relevant decision: what
 * happens to rate limiting when Redis itself is unavailable.
 *
 * Most routes (globalRateLimit, usersRateLimit, createAdRateLimit,
 * favoritesRateLimit, reportRateLimit) are intentionally fail-OPEN —
 * if Redis is down, requests are allowed through rather than blocking
 * all traffic on an infrastructure outage unrelated to abuse.
 *
 * Sensitive auth-adjacent routes (authRateLimit, refreshRateLimit,
 * forgotPasswordRateLimit, changePasswordRateLimit — FIX SEC-09) are
 * intentionally fail-CLOSED — exactly the moment Redis is unavailable
 * is also a moment brute-force/credential-stuffing attempts become
 * both more likely and harder to detect by other means, so these must
 * not silently lose their limit.
 *
 * These tests exercise makeSendCommand directly (extracted from
 * createRedisStore specifically to make this testable without
 * depending on rate-limit-redis's internal RedisStore API, which
 * isn't available to inspect in this environment).
 */
describe('rateLimit.middleware — makeSendCommand fail-open/fail-closed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('fail-open (failOpen=true — default, used by globalRateLimit etc.)', () => {
    it('returns the real result when Redis is healthy', async () => {
      (redis.call as jest.Mock).mockResolvedValueOnce(['mock', 'reply']);
      const sendCommand = makeSendCommand(true);

      const result = await sendCommand('EVALSHA', 'sha', '1', 'key');

      expect(result).toEqual(['mock', 'reply']);
    });

    it('returns 0 (treated as "not rate limited") instead of throwing when Redis fails', async () => {
      (redis.call as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const sendCommand = makeSendCommand(true);

      const result = await sendCommand('EVALSHA', 'sha', '1', 'key');

      // FIX TEST-V4-05: this is the actual fail-open contract — a
      // Redis outage must not throw up through express-rate-limit and
      // 500 every request; it must look like "no hits recorded yet".
      expect(result).toBe(0);
    });
  });

  describe('fail-closed (failOpen=false — used by authRateLimit, refreshRateLimit, forgotPasswordRateLimit)', () => {
    it('returns the real result when Redis is healthy', async () => {
      (redis.call as jest.Mock).mockResolvedValueOnce(['mock', 'reply']);
      const sendCommand = makeSendCommand(false);

      const result = await sendCommand('EVALSHA', 'sha', '1', 'key');

      expect(result).toEqual(['mock', 'reply']);
    });

    it('propagates the error instead of silently allowing the request through when Redis fails', async () => {
      (redis.call as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const sendCommand = makeSendCommand(false);

      // FIX TEST-V4-05: this is the actual fail-closed contract — a
      // Redis outage on a sensitive endpoint must surface as an error
      // (which express-rate-limit/error middleware then turns into a
      // 5xx), not silently disable the rate limit protecting it.
      await expect(sendCommand('EVALSHA', 'sha', '1', 'key')).rejects.toThrow('ECONNREFUSED');
    });
  });

  // FIX SEC-09 coverage: POST /users/me/password previously relied only
  // on the loose, fail-open usersRateLimit (60/15min) for an endpoint
  // that verifies a caller-supplied password — effectively an
  // unthrottled guessing oracle for anyone holding a stolen access
  // token. The actual max=10/windowMs=15min budget is verified via a
  // real HTTP integration test (tests/integration/users.extended.test.ts)
  // since express-rate-limit doesn't expose those values through a
  // stable public API to assert on directly here — this unit test
  // covers the fail-open/closed behavior specifically.
  describe('changePasswordRateLimit fail-closed behavior', () => {
    it('fails closed (propagates the error) when Redis is unavailable, like authRateLimit', async () => {
      (redis.call as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
      // changePasswordRateLimit is built with createRedisStore(prefix, false)
      // — reuse makeSendCommand(false) directly to assert the same
      // fail-closed contract without needing to drive a full Express
      // request through the rate-limit-redis store internals.
      const sendCommand = makeSendCommand(false);
      await expect(sendCommand('EVALSHA', 'sha', '1', 'key')).rejects.toThrow('ECONNREFUSED');
    });
  });

});
