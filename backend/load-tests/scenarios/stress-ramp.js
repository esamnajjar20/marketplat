/**
 * load-tests/scenarios/stress-ramp.js
 *
 * PROGRESSIVE-RAMP-01: a staircase capacity test — VUs climb in
 * discrete steps (100 → 300 → 500 → 700 → 1000 → 1300 → 1500 → 1700 →
 * 2000 → 2500 → 2800 → 3000 → 3300 → 3600 → 4000 → 4500 → 5000),
 * holding briefly at every step before climbing to the next, rather
 * than browsing.js's single ramp-then-plateau or spike.js's sudden
 * jump. The point of a staircase specifically (vs. those two) is
 * finding WHERE along the range things start to degrade — each hold
 * is its own mini data point, so a threshold breach or latency
 * inflection can be pinned to a specific concurrency level instead of
 * only knowing "somewhere between 0 and peak it got bad".
 *
 * The last four steps (3600/4000/4500/5000) extend the requested
 * 100..3300 sequence in similar-sized increments to actually reach
 * 5000 — the concrete ask was "progressively up to 5000", so this
 * continues the same staircase shape rather than jumping straight
 * from 3300 to 5000.
 *
 * Same target endpoints as browsing.js/spike.js and for the same
 * reason: GET /ads and GET /ads/:id are public and carry no rate
 * limit (see ads.routes.ts), so they're the only routes where a
 * concurrency number this high measures real capacity instead of
 * mostly measuring the rate limiter's 429 behavior from a handful of
 * shared load-generator IPs (see config.js's own header comment).
 *
 * READ THIS BEFORE RUNNING AT THE TOP OF THIS RANGE:
 *   - 5000 VUs opening real HTTP connections is a serious amount of
 *     load to generate, not just to receive. A single k6 process on a
 *     standard GitHub-hosted runner (2 vCPU) will very likely become
 *     the bottleneck well before the backend does — you'll see rising
 *     client-side latency/errors that reflect the load generator
 *     running out of CPU/file descriptors, not the API actually
 *     failing. Treat any degradation seen above roughly 1500-2000 VUs
 *     from a single small runner with suspicion until you've confirmed
 *     it against `k6 cloud` (distributed, multi-IP) or several
 *     self-hosted runners generating load in parallel.
 *   - This creates real, sustained concurrent traffic — never point it
 *     at production. Use a dedicated load-test environment sized
 *     similarly to what you're actually trying to validate.
 *   - Every number in this file (targets, hold durations, thresholds)
 *     is a starting point, exactly like every other scenario in this
 *     suite (see the suite README) — nothing here has been verified
 *     against a real run in this environment.
 *
 * Run:
 *   k6 run load-tests/scenarios/stress-ramp.js
 *   LOAD_TEST_BASE_URL=http://staging:5000 k6 run load-tests/scenarios/stress-ramp.js
 *
 *   # Shrink the whole staircase for a quick local smoke run before
 *   # committing to a full 5000-VU pass:
 *   STRESS_SCALE=0.1 k6 run load-tests/scenarios/stress-ramp.js
 *
 * Prerequisite: same as browsing.js — run seed:e2e or otherwise
 * ensure there are at least a few dozen ACTIVE ads in the target
 * database. At thousands of VUs, a thin dataset also means every VU
 * is hammering the same handful of rows/cache keys, which is its own
 * unrealistic distortion — seed generously before trusting numbers
 * from the top of this range.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { API, DEFAULT_THRESHOLDS } from '../scripts/config.js';

// Scales every target VU count down together — lets you smoke-test the
// staircase's shape locally (STRESS_SCALE=0.1 → tops out at 500, not
// 5000) without hand-editing the stage list, then run the real thing
// with the default of 1.
const SCALE = parseFloat(__ENV.STRESS_SCALE || '1');
const scaled = (n) => Math.max(1, Math.round(n * SCALE));

// Seconds to ramp INTO each step and seconds to HOLD once there.
// Fixed rather than scaled with STRESS_SCALE — a shrunk smoke run
// should still exercise the same timing shape, just at lower
// concurrency, not finish in a few seconds.
const RAMP_S = parseInt(__ENV.STRESS_RAMP_SECONDS || '20', 10);
const HOLD_S = parseInt(__ENV.STRESS_HOLD_SECONDS || '40', 10);

// The staircase itself — the exact sequence requested, continued in
// similar-sized increments up to 5000 (see file header).
const STEPS = [100, 300, 500, 700, 1000, 1300, 1500, 1700, 2000, 2500, 2800, 3000, 3300, 3600, 4000, 4500, 5000];

function buildStages() {
  const stages = [];
  let previous = 0;
  for (const step of STEPS) {
    const target = scaled(step);
    // Skip a step that collapses onto the previous one after scaling
    // down (e.g. 100 and 300 both rounding to the same low number at
    // very small SCALE values) — a zero-duration/no-op stage adds
    // nothing and just clutters the summary output.
    if (target === previous) continue;
    stages.push({ duration: `${RAMP_S}s`, target });
    stages.push({ duration: `${HOLD_S}s`, target });
    previous = target;
  }
  // Clean ramp-down at the end rather than an abrupt cutoff mid-request.
  stages.push({ duration: '30s', target: 0 });
  return stages;
}

const listDuration = new Trend('stress_ads_list_duration', true);
const detailDuration = new Trend('stress_ads_detail_duration', true);
// Separate from http_req_failed's whole-run average for the same
// reason spike.js tracks its own counter: a failure rate averaged
// across all 17 steps hides which step it actually started at.
const stressErrors = new Counter('stress_errors');

export const options = {
  scenarios: {
    stress_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: buildStages(),
    },
  },
  thresholds: {
    // Deliberately more lenient than browsing.js's steady-state bar,
    // same reasoning as spike.js: this range is explicitly meant to
    // include "and here's where it starts to break", not just confirm
    // a single peak holds up cleanly. Read the per-step numbers in the
    // summary/JSON export, not just whether this threshold passed.
    ...DEFAULT_THRESHOLDS,
    http_req_failed: ['rate<0.10'],
    http_req_duration: ['p(95)<5000'],
  },
};

function fetchAdsList() {
  const page = Math.floor(Math.random() * 5) + 1;
  const res = http.get(`${API}/ads?page=${page}&limit=20`, {
    tags: { name: 'GET /ads' },
  });

  listDuration.add(res.timings.duration);
  if (res.status >= 500 || res.status === 0) {
    stressErrors.add(1);
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
    stressErrors.add(1);
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

  // Light think-time, same spirit as spike.js — at the top of this
  // range the point is sustained pressure, not a leisurely human pace.
  sleep(Math.random() * 0.5);
}
