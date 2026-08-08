/**
 * load-tests/scenarios/soak.js
 *
 * FIX M-028 — closes the gap this suite's own README explicitly
 * flagged under "What's NOT covered here": sustained/soak testing.
 * Every other scenario in this directory runs for a few minutes at
 * most, which is enough to catch connection-pool exhaustion or a
 * slow endpoint under peak load, but not enough to catch problems
 * that only accumulate over hours — a slow memory leak, Redis keys
 * that should expire but don't (viewsBuffer.ts / activityBuffer.ts's
 * buffered writes, rate-limit-redis's own TTLs), or a connection pool
 * that degrades gradually rather than failing outright.
 *
 * This scenario holds a moderate, steady load (well under peak — the
 * point is duration, not intensity) for an extended period against
 * the same realistic browsing mix browsing.js already uses, so it's
 * exercising real code paths rather than a synthetic no-op endpoint.
 *
 * Run:
 *   k6 run load-tests/scenarios/soak.js
 *   LOAD_TEST_BASE_URL=http://staging:5000 k6 run load-tests/scenarios/soak.js
 *
 * Default duration is intentionally 1 hour, per the audit
 * recommendation — override with SOAK_DURATION for a shorter smoke
 * run while iterating on the script itself, e.g.:
 *   SOAK_DURATION=5m k6 run load-tests/scenarios/soak.js
 *
 * What to watch WHILE this runs (not just the k6 summary at the end):
 *   - Process RSS memory over time (`pm2 monit`, or docker stats) —
 *     a steady climb that never plateaus is a leak.
 *   - `redis-cli INFO keyspace` / `DBSIZE` sampled periodically — key
 *     count should stay roughly flat once buffers are flushing
 *     correctly, not grow unbounded.
 *   - Postgres active connection count (`SELECT count(*) FROM
 *     pg_stat_activity`) — should stay within DB_CONNECTION_LIMIT ×
 *     PM2 instances, not creep upward over the run.
 *
 * Prerequisite: same as browsing.js — run seed:e2e or otherwise
 * ensure there are at least a few dozen ACTIVE ads in the target
 * database.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { API, DEFAULT_THRESHOLDS } from '../scripts/config.js';

const SOAK_DURATION = __ENV.SOAK_DURATION || '1h';
// Moderate, constant load — not a peak/stress test. The goal is
// exposing time-accumulated problems, which needs duration far more
// than it needs intensity; a plateau this high would just re-run
// browsing.js's own peak-load scenario for an hour instead of testing
// something new.
const SOAK_VUS = parseInt(__ENV.SOAK_VUS || '30', 10);

const listDuration = new Trend('soak_ads_list_duration', true);
const detailDuration = new Trend('soak_ads_detail_duration', true);

export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: SOAK_VUS,
      duration: SOAK_DURATION,
    },
  },
  thresholds: {
    ...DEFAULT_THRESHOLDS,
    // Slightly more lenient than browsing.js's peak-load thresholds —
    // this is steady-state load, but the point of a soak test is
    // catching *degradation over time*, which k6's own end-of-run
    // threshold check can't detect on its own (it only sees the
    // aggregate). Watch the Trend metrics' behavior over the run
    // itself, e.g. via `k6 run --out json=soak-results.json` and a
    // time-bucketed analysis afterward, not just whether this
    // threshold ultimately passed or failed.
    soak_ads_list_duration: ['p(95)<800'],
    soak_ads_detail_duration: ['p(95)<500'],
  },
};

function fetchAdsList() {
  const page = Math.floor(Math.random() * 5) + 1;
  const res = http.get(`${API}/ads?page=${page}&limit=20`, {
    tags: { name: 'GET /ads' },
  });

  listDuration.add(res.timings.duration);

  check(res, {
    'GET /ads: status 200': (r) => r.status === 200,
  });

  return res.status === 200 ? res.json('data') : [];
}

function fetchAdDetail(adId) {
  const res = http.get(`${API}/ads/${adId}`, { tags: { name: 'GET /ads/:id' } });

  detailDuration.add(res.timings.duration);

  check(res, {
    'GET /ads/:id: status 200': (r) => r.status === 200,
  });
}

export default function () {
  const ads = fetchAdsList();

  if (ads.length > 0) {
    const randomAd = ads[Math.floor(Math.random() * ads.length)];
    if (randomAd && randomAd.id) {
      sleep(0.5);
      fetchAdDetail(randomAd.id);
    }
  }

  // Slightly longer think-time than browsing.js — at soak duration,
  // the interesting failure modes are time-accumulated, not
  // throughput-driven, so there's no benefit to maximizing request
  // rate at the expense of the run's stability over hours.
  sleep(Math.random() * 3 + 2);
}
