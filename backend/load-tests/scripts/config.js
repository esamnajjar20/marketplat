/**
 * load-tests/scripts/config.js
 *
 * Shared config for every k6 scenario in this suite. Import from here
 * rather than hardcoding BASE_URL/thresholds per-file, so pointing the
 * whole suite at a different environment (staging vs. a local Docker
 * stack) is one env var, not a find-and-replace across files.
 *
 * IMPORTANT — read before running anything in this directory:
 * Rate limits are real and enforced (see rateLimit.middleware.ts):
 *   - authRateLimit:          10 requests / 15 min / IP  (register, login, reset-password)
 *   - refreshRateLimit:       30 requests / 15 min / IP
 *   - forgotPasswordRateLimit: 3 requests / hour / IP
 *   - createAdRateLimit:      20 requests / hour / IP
 *   - addAdImagesRateLimit:   30 requests / hour / IP
 *   - globalRateLimit:        600 requests / 15 min / IP (everything under /api)
 *
 * A k6 load generator is ONE (or a small handful of) IP address(es) by
 * default — every virtual user (VU) shares that IP unless you're
 * running distributed load generation from many machines. This means
 * "500 concurrent VUs all logging in" does NOT simulate 500 different
 * real users hitting the login rate limit independently — it hits
 * authRateLimit's 10-per-15-min ceiling almost immediately, and every
 * scenario in this suite is deliberately designed around that reality:
 *   - auth-flow.js tests the LOGIN RATE LIMIT ITSELF as the thing under
 *     test (expects and asserts on 429s), not "how many users can log
 *     in per second" (that question is nonsensical against this
 *     limiter from a single IP).
 *   - browsing.js and search.js pre-authenticate a small, FIXED pool of
 *     users ONCE during setup() (well under the 10/15min ceiling) and
 *     reuse their tokens for the actual read-heavy load, which is
 *     where this app's real capacity questions live (GET /ads,
 *     /ads/search, /ads/:id have NO rate limit — see ads.routes.ts).
 *   - ad-creation.js respects the 20/hour createAdRateLimit explicitly
 *     and documents why it cannot meaningfully test "creation at
 *     scale" without either raising that limit in a dedicated
 *     load-test environment config or running many distributed IPs —
 *     neither of which this script does silently or by accident.
 */
export const BASE_URL = __ENV.LOAD_TEST_BASE_URL || 'http://localhost:5000';
export const API = `${BASE_URL}/api/v1`;

// Shared, generous thresholds as a starting point — tune these once
// you have a real baseline run's numbers; a threshold nobody has ever
// actually hit is a threshold that isn't protecting anything yet.
export const DEFAULT_THRESHOLDS = {
  http_req_failed: ['rate<0.01'], // <1% hard failures (5xx, timeouts, connection errors)
  http_req_duration: ['p(95)<800', 'p(99)<2000'],
};

/** Standard headers for authenticated JSON requests. */
export function authHeaders(accessToken) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  };
}

export const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };
