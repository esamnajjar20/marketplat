/**
 * load-tests/scenarios/auth-rate-limit.js
 *
 * This does NOT test "how fast can users log in" — from a single load
 * generator IP, that question is meaningless against authRateLimit's
 * 10-requests-per-15-minutes-per-IP ceiling (rateLimit.middleware.ts).
 * What it DOES test: that the rate limiter itself behaves correctly
 * under concurrent load — specifically, that concurrent requests
 * arriving at nearly the same instant are counted correctly (no race
 * condition letting more than 10 through), and that the 429 response
 * itself is fast and doesn't degrade under concurrency the way an
 * accidentally-expensive rate-limit check (e.g. one that hits Postgres
 * instead of Redis) might.
 *
 * Expected, correct outcome: with more than 10 concurrent VUs, exactly
 * 10 (or very close to it, allowing for the Redis-backed counter's own
 * consistency window) succeed or get a real auth response, and the
 * rest get 429 Too Many Requests. If ALL of them succeed, or MORE than
 * ~10-15 succeed, that's the finding — the rate limiter has a
 * concurrency bug, and this test exists specifically to catch that.
 *
 * Run this scenario in isolation, not alongside the other scenarios in
 * the same 15-minute window — it deliberately exhausts
 * authRateLimit for its own test IP, and any other scenario in this
 * suite that also hits /auth/login or /auth/register from the same
 * machine would then get spuriously rate-limited too.
 *
 *   k6 run load-tests/scenarios/auth-rate-limit.js
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { API, JSON_HEADERS } from '../scripts/config.js';

const successCount = new Counter('login_attempts_succeeded');
const rateLimitedCount = new Counter('login_attempts_rate_limited');
const unexpectedCount = new Counter('login_attempts_unexpected_status');

export const options = {
  scenarios: {
    // A single, sharp burst — not a ramp. This specifically wants many
    // requests landing within the same short window to test the
    // limiter's concurrency handling, not a gradual climb that would
    // let earlier requests' 15-minute windows start expiring before
    // later ones even arrive.
    concurrent_login_burst: {
      executor: 'shared-iterations',
      vus: 25,
      iterations: 25,
      maxDuration: '30s',
    },
  },
  // No http_req_duration/failure-rate thresholds here — 429 is an
  // EXPECTED, correct status for most of these requests, not a
  // failure. The real pass/fail condition is checked in the custom
  // checks below and in the summary this script prints.
};

// A real, seeded, valid account exists so the requests hitting through
// (up to the limit) get a genuine 200 auth response — using a
// nonexistent email would make every request 401 regardless of the
// rate limiter, muddying which one you're actually testing. This must
// match a real user in the target database (register it yourself
// first, or point this at a known seeded account).
const TEST_EMAIL = __ENV.LOAD_TEST_LOGIN_EMAIL || 'load-test-pool-user-0@example.test';
const TEST_PASSWORD = __ENV.LOAD_TEST_LOGIN_PASSWORD || 'LoadTestPass123!';

export default function () {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    JSON_HEADERS,
  );

  if (res.status === 200) {
    successCount.add(1);
  } else if (res.status === 429) {
    rateLimitedCount.add(1);
  } else {
    unexpectedCount.add(1);
  }

  check(res, {
    'status is either 200 (under the limit) or 429 (rate limited) — never anything else': (r) =>
      r.status === 200 || r.status === 429,
  });
}

export function handleSummary(data) {
  const succeeded = data.metrics.login_attempts_succeeded
    ? data.metrics.login_attempts_succeeded.values.count
    : 0;
  const limited = data.metrics.login_attempts_rate_limited
    ? data.metrics.login_attempts_rate_limited.values.count
    : 0;
  const unexpected = data.metrics.login_attempts_unexpected_status
    ? data.metrics.login_attempts_unexpected_status.values.count
    : 0;

  // eslint-disable-next-line no-console
  console.log(`
=== Auth rate limit result ===
Succeeded (200):        ${succeeded}
Rate limited (429):     ${limited}
Unexpected status:      ${unexpected}
Expected: succeeded should be <= ~10-15 (authRateLimit's configured
ceiling, with some slack for the Redis counter's consistency window).
If succeeded is significantly higher than that, the rate limiter has a
concurrency bug — investigate createRedisStore's increment logic
(rateLimit.middleware.ts) for a race condition before assuming this is
fine.
`);

  return {
    stdout: '', // suppress k6's default console summary duplication; the log above is the real report
  };
}
