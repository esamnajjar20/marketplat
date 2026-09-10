/**
 * load-tests/scenarios/spike.js
 *
 * FIX M-028 — the other half of the gap this suite's README flagged
 * under "What's NOT covered here": browsing.js ramps gradually (30s →
 * 1m → hold), which is realistic for organic traffic growth but never
 * tests what happens when load jumps suddenly — a link going viral, a
 * marketing push, or a traffic surge with no warm-up period at all.
 * A gradual ramp gives the connection pool, caches, and rate limiter
 * state time to reach steady-state incrementally; a spike does not,
 * and that difference is exactly what this scenario is for.
 *
 * Run:
 *   k6 run load-tests/scenarios/spike.js
 *   LOAD_TEST_BASE_URL=http://staging:5000 k6 run load-tests/scenarios/spike.js
 *
 * Prerequisite: same as browsing.js — run seed:e2e or otherwise
 * ensure there are at least a few dozen ACTIVE ads in the target
 * database.
 *
 * What this is NOT: this hits the same public, unauthenticated,
 * unrate-limited read endpoints browsing.js does (GET /ads, GET
 * /ads/:id — see ads.routes.ts) for the same reason browsing.js
 * documents: a sudden spike of write/auth traffic against
 * authRateLimit/createAdRateLimit would just measure the rate
 * limiter's 429 behavior, not the system's real capacity under a
 * traffic surge. If you specifically need to spike-test the rate
 * limiter's own behavior under a burst, see auth-rate-limit.js.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { API, DEFAULT_THRESHOLDS } from '../scripts/config.js';

const listDuration = new Trend('spike_ads_list_duration', true);
const detailDuration = new Trend('spike_ads_detail_duration', true);
// Explicit counter for 5xx/timeout responses during the spike window —
// separate from http_req_failed's aggregate rate, since what matters
// here is specifically whether the system falls over exactly when the
// jump happens, not the failure rate averaged across the whole run
// (which the ramp-down periods would dilute).
const spikeErrors = new Counter('spike_errors');

// LOAD_TEST_VUS overrides the spike's peak VU count without editing
// this file (see browsing.js's comment for the mechanism). Baseline
// stays at 2% of peak, matching the original 10-of-500 ratio — the
// point of a spike test is the sudden jump FROM a low baseline, so
// baseline should stay small relative to peak rather than fixed.
const VUS = parseInt(__ENV.LOAD_TEST_VUS || '500', 10);
const BASELINE_VUS = Math.max(1, Math.round(VUS * 0.02));

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: BASELINE_VUS }, // brief, realistic baseline before the spike
        { duration: '10s', target: VUS }, // the spike itself — sudden jump, no gradual warm-up
        { duration: '2m', target: VUS }, // hold at peak — does the system recover/stabilize, or degrade further?
        { duration: '20s', target: BASELINE_VUS }, // sudden drop-off — does recovery happen cleanly?
        { duration: '30s', target: BASELINE_VUS }, // brief cool-down at baseline to observe post-spike recovery
      ],
    },
  },
  thresholds: {
    // Deliberately more lenient than browsing.js's steady-state
    // thresholds — the point of a spike test is to observe *how* the
    // system degrades (elevated latency, a burst of 503s that then
    // recovers) rather than assert it must handle 500 concurrent VUs
    // appearing in 10 seconds with zero impact, which is an
    // unrealistic bar for a sudden 50x jump. Tune these once you have
    // a real baseline spike run's numbers.
    http_req_failed: ['rate<0.05'], // some elevated failure during the spike itself is expected; >5% is the real concern
    http_req_duration: ['p(95)<3000'],
  },
};

function fetchAdsList() {
  const page = Math.floor(Math.random() * 5) + 1;
  const res = http.get(`${API}/ads?page=${page}&limit=20`, {
    tags: { name: 'GET /ads' },
  });

  listDuration.add(res.timings.duration);
  if (res.status >= 500 || res.status === 0) {
    spikeErrors.add(1);
  }

  check(res, {
    'GET /ads: status 200': (r) => r.status === 200,
  });

  return res.status === 200 ? res.json('data') : [];
}

function fetchAdDetail(adId) {
  const res = http.get(`${API}/ads/${adId}`, { tags: { name: 'GET /ads/:id' } });

  detailDuration.add(res.timings.duration);
  if (res.status >= 500 || res.status === 0) {
    spikeErrors.add(1);
  }

  check(res, {
    'GET /ads/:id: status 200': (r) => r.status === 200,
  });
}

export default function () {
  const ads = fetchAdsList();

  if (ads.length > 0) {
    const randomAd = ads[Math.floor(Math.random() * ads.length)];
    if (randomAd && randomAd.id) {
      fetchAdDetail(randomAd.id);
    }
  }

  // Minimal think-time on purpose — a real spike (viral link, push
  // notification blast) looks like a burst of near-simultaneous
  // requests, not politely-paced human browsing.
  sleep(Math.random() * 0.5);
}
