/**
 * load-tests/scenarios/connection-pool-stress.js
 *
 * Targeted probe for the exact capacity question capacityCheck.ts
 * raises at boot time as a theoretical warning: PM2 cluster mode runs
 * `instances: 'max'` (ecosystem.config.js), each instance holding its
 * own independent Prisma connection pool sized by DB_CONNECTION_LIMIT
 * (default 20 — see .env.example). Total possible connections across
 * the cluster is therefore (PM2 instance count × connection_limit),
 * and nothing in this stack currently verifies that figure stays under
 * whatever Postgres's actual max_connections is (docker-compose.full.yml
 * doesn't override it, so it's running on the postgres:15-alpine
 * image's own default — commonly 100, but confirm with `SHOW
 * max_connections;` against your actual target rather than assuming).
 *
 * This test doesn't calculate that arithmetic for you — it can't know
 * your deployment's real core count or Postgres config from here. What
 * it does: sustains enough concurrent, DB-hitting requests for long
 * enough that if the pool IS exhausted, it shows up as measurable
 * symptoms (timeouts, 5xxs, or a sharp latency cliff as requests queue
 * behind pool_timeout=30s) rather than staying invisible under light
 * load that a quick smoke test wouldn't reveal.
 *
 * Uses GET /ads/me (authenticated, per-user query — deliberately NOT
 * the cached public GET /ads list) specifically because it's less
 * likely to be served from the Redis cache-aside layer
 * (ads.service.ts's getAds() checks a Redis cache first) — this
 * script wants to pressure the actual Postgres connection pool, not
 * mostly measure Redis hit rates the way hammering the public list
 * endpoint with popular query params might.
 *
 * Run:
 *   k6 run load-tests/scenarios/connection-pool-stress.js
 *
 * Interpreting results:
 *   - If p95/p99 latency stays flat as VUs ramp and http_req_failed
 *     stays near 0: the pool (at this VU count, on this deployment)
 *     has headroom.
 *   - If you see a latency cliff plus a rise in failed requests
 *     correlated with the ramp to peak VUs, not gradually across the
 *     whole run: that's the pool_timeout=30s queueing symptom
 *     capacityCheck.ts warns about, now measured instead of assumed.
 *   - Check the backend's own logs/APM during the run, not just this
 *     script's output — Postgres-side "too many connections" errors
 *     or slow-query logs are the other half of confirming root cause.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API } from '../scripts/config.js';
import { poolUserCredentials } from '../scripts/helpers.js';

const POOL_SIZE = parseInt(__ENV.LOAD_TEST_POOL_SIZE || '10', 10);

export const options = {
  scenarios: {
    pool_pressure: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '20s', target: 30 },
        { duration: '30s', target: 150 }, // deliberately aggressive — this IS the stress test
        { duration: '2m', target: 150 }, // sustained peak, long enough for queueing to surface
        { duration: '20s', target: 0 },
      ],
    },
  },
  thresholds: {
    // No hard pass/fail threshold on duration here on purpose — the
    // whole point of this script is to OBSERVE where the cliff is, not
    // assert a number you don't have a real baseline for yet. Re-run
    // with a tuned threshold once you've seen one real result.
    http_req_failed: ['rate<0.10'], // loose ceiling — flags true meltdown, not minor degradation
  },
};

/**
 * setup() logs in a small, fixed pool of already-registered users
 * ONCE (not per-VU, not per-iteration) — reusing backend-v9's own
 * seed:e2e-created accounts is the simplest path if you're running
 * this against an environment that's already been seeded (see
 * marketplace-v10/e2e/README.md's seed:e2e instructions, which this
 * script deliberately does NOT duplicate — one seeding source of
 * truth, not two scripts that can drift apart).
 *
 * Falls back to registering the pool fresh if login fails (first run
 * against a clean, unseeded DB) — but registering POOL_SIZE users
 * still counts against authRateLimit (10/15min/IP), so POOL_SIZE
 * should stay small (the default of 10 is deliberately AT that limit,
 * not comfortably under it — lower it if you're also running other
 * auth-consuming scenarios in the same window).
 */
export function setup() {
  const users = poolUserCredentials(POOL_SIZE);
  const tokens = [];

  for (const user of users) {
    let res = http.post(
      `${API}/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: { 'Content-Type': 'application/json' } },
    );

    if (res.status !== 200) {
      // Not yet registered — register once, accepting the authRateLimit
      // cost, since this only happens on a fresh/unseeded database.
      res = http.post(
        `${API}/auth/register`,
        JSON.stringify(user),
        { headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (res.status === 200 || res.status === 201) {
      tokens.push(res.json('data.tokens.accessToken'));
    }
  }

  if (tokens.length === 0) {
    throw new Error(
      'setup() could not authenticate or register any pool user — check the target API is ' +
        'reachable and authRateLimit budget is not already exhausted for this IP.',
    );
  }

  return { tokens };
}

export default function (data) {
  const token = data.tokens[Math.floor(Math.random() * data.tokens.length)];

  const res = http.get(`${API}/ads/me`, {
    headers: { Authorization: `Bearer ${token}` },
    tags: { name: 'GET /ads/me' },
  });

  check(res, {
    'GET /ads/me: not a 5xx (would indicate DB/pool exhaustion, not an auth or client error)': (r) =>
      r.status < 500,
  });

  sleep(0.3); // deliberately short — this scenario wants sustained pressure, not a leisurely pace
}
