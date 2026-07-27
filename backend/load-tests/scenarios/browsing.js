/**
 * load-tests/scenarios/browsing.js
 *
 * The core read-heavy load test: GET /ads (list), GET /ads/:id
 * (detail). These are the two endpoints a real anonymous visitor hits
 * most, they're public (no auth needed, no rate limit — see
 * ads.routes.ts), and they're exactly where this app's own README
 * ("Known Technical Debt") flagged real capacity as unverified: PM2
 * cluster mode running `instances: 'max'`, each with its own
 * connection_limit=20 Prisma pool (see ecosystem.config.js /
 * .env.example's DB_CONNECTION_LIMIT), against a Postgres instance
 * with no explicit max_connections override in docker-compose.full.yml
 * (so it's running on the postgres:15-alpine image's own default,
 * typically 100). On a machine with more than ~5 CPU cores, PM2's
 * instances × 20 can exceed that ceiling — this test's job is to make
 * that a measured fact instead of a theoretical warning.
 *
 * Run:
 *   k6 run load-tests/scenarios/browsing.js
 *   LOAD_TEST_BASE_URL=http://staging:5000 k6 run load-tests/scenarios/browsing.js
 *
 * Prerequisite: run seed:e2e or otherwise ensure there are at least a
 * few dozen ACTIVE ads in the target database — GET /ads against an
 * empty table tells you nothing about real query/index performance.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { API, DEFAULT_THRESHOLDS } from '../scripts/config.js';

// Separate custom trends for list vs. detail requests — a single
// blended http_req_duration would hide it if one of the two is fine
// and the other is the actual problem.
const listDuration = new Trend('ads_list_duration', true);
const detailDuration = new Trend('ads_detail_duration', true);

export const options = {
  scenarios: {
    // Ramps from a light background load up to a sustained peak,
    // holds it long enough to expose connection-pool exhaustion (which
    // only shows up once concurrent in-flight queries actually queue
    // up faster than Postgres can drain them — a 10-second spike
    // rarely reveals this, a sustained plateau does), then ramps back
    // down cleanly rather than cutting off mid-request.
    steady_browsing: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 }, // warm-up
        { duration: '1m', target: 100 }, // ramp to a realistic peak
        { duration: '3m', target: 100 }, // hold — this is where pool exhaustion would surface
        { duration: '30s', target: 0 }, // cool down
      ],
    },
  },
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    ads_list_duration: ['p(95)<500'],
    ads_detail_duration: ['p(95)<300'], // single-row lookup by indexed id — should be fast even under load
  },
};

/** Fetches a page of ads and returns the array of ad objects (or []
 * if the response didn't have the expected shape). */
function fetchAdsList() {
  const page = Math.floor(Math.random() * 5) + 1; // pages 1-5, spreads load across a few cache-key variants
  const res = http.get(`${API}/ads?page=${page}&limit=20`, {
    tags: { name: 'GET /ads' },
  });

  listDuration.add(res.timings.duration);

  check(res, {
    'GET /ads: status 200': (r) => r.status === 200,
    'GET /ads: has items array': (r) => Array.isArray(r.json('data')),
  });

  return res.status === 200 ? res.json('data') : [];
}

function fetchAdDetail(adId) {
  const res = http.get(`${API}/ads/${adId}`, { tags: { name: 'GET /ads/:id' } });

  detailDuration.add(res.timings.duration);

  check(res, {
    'GET /ads/:id: status 200': (r) => r.status === 200,
    'GET /ads/:id: has title': (r) => !!r.json('data.title'),
  });
}

export default function () {
  // Realistic pattern: a visitor loads a listing page, then opens one
  // of the results — not every VU hammering the list endpoint alone
  // (real traffic is never 100% list-only) and not every VU skipping
  // straight to a detail page (they'd need a list first to get an id
  // from, same as a real user browsing rather than typing a URL).
  const ads = fetchAdsList();

  if (ads.length > 0) {
    const randomAd = ads[Math.floor(Math.random() * ads.length)];
    if (randomAd && randomAd.id) {
      sleep(0.5); // a human pause between "see the list" and "click one"
      fetchAdDetail(randomAd.id);
    }
  }

  sleep(Math.random() * 2 + 1); // 1-3s between a VU's iterations, roughly human page-dwell time
}
