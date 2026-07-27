/**
 * load-tests/scenarios/ad-creation.js
 *
 * Honest framing up front: this CANNOT meaningfully load-test "ad
 * creation at scale" as a single k6 run from one machine.
 * createAdRateLimit caps POST /ads at 20 requests/hour/IP
 * (rateLimit.middleware.ts) — a real, deliberate anti-abuse measure,
 * not a bug to work around. From one IP, the 21st creation attempt in
 * any rolling hour gets a 429 regardless of how many VUs or how much
 * hardware is generating the load.
 *
 * What this script actually does, honestly: creates ads up to a
 * configurable cap safely under that limit (default 15, leaving
 * headroom for other things sharing the same IP/hour, like the
 * auth-rate-limit.js scenario or manual testing), measures latency for
 * the write path specifically — POST /ads is meaningfully more
 * expensive than the read endpoints in browsing.js/search.js: it holds
 * a real image upload to Cloudinary (uploadImage in
 * ads.service.ts — a genuine external network call, not something this
 * script mocks, since the whole point is measuring the REAL path) and
 * a database write with cache invalidation — and reports on that
 * meaningfully, rather than pretending it's the same shape of test as
 * the read scenarios.
 *
 * If you genuinely need higher-throughput write-path numbers (e.g. for
 * a specific capacity-planning question), the two real options are:
 *   1. Run this from many distributed IPs (k6 Cloud, or your own
 *      multi-machine setup) so the per-IP ceiling doesn't dominate —
 *      still bounded by MAX_ADS_PER_USER per account, though (see
 *      env.ads.maxPerUser / ads.extended.test.ts), so you'd also need
 *      many distinct user accounts, not just many IPs.
 *   2. Temporarily raise createAdRateLimit's `max` in a dedicated,
 *      non-production load-test environment config — never do this
 *      against a shared/staging environment other people or automated
 *      jobs are also relying on the real limit for.
 * This script does neither silently. If you need one of those, that's
 * a deliberate decision to make explicitly, not a flag to pass here.
 *
 * Run:
 *   k6 run load-tests/scenarios/ad-creation.js
 *
 * Requires a real registered user's credentials (register one via the
 * UI, backend-v9's seed:e2e script, or auth-rate-limit.js's target
 * account) — set via env vars, since committing real credentials
 * anywhere in this repo would be its own security problem.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { API } from '../scripts/config.js';

const createDuration = new Trend('ad_create_duration', true);

const MAX_CREATIONS = parseInt(__ENV.LOAD_TEST_MAX_AD_CREATIONS || '15', 10);

export const options = {
  scenarios: {
    ad_creation_within_rate_limit: {
      executor: 'shared-iterations',
      vus: 3, // a small, realistic number of concurrent sellers, not a stress burst
      iterations: MAX_CREATIONS,
      maxDuration: '2m',
    },
  },
  thresholds: {
    // Deliberately loose and specific to the write path — this
    // includes a real Cloudinary round trip, so comparing it to
    // browsing.js's read-path thresholds would be comparing two
    // different things.
    ad_create_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
  },
};

const LOGIN_EMAIL = __ENV.LOAD_TEST_LOGIN_EMAIL;
const LOGIN_PASSWORD = __ENV.LOAD_TEST_LOGIN_PASSWORD;

if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
  throw new Error(
    'ad-creation.js requires LOAD_TEST_LOGIN_EMAIL and LOAD_TEST_LOGIN_PASSWORD env vars ' +
      '— a real, already-registered account. Refusing to guess or fall back to a hardcoded ' +
      'credential here, since a hardcoded one would either be a real secret committed to this ' +
      'repo or a fake one that silently fails every iteration with a confusing 401.',
  );
}

// A 1x1 transparent PNG's real bytes (not a placeholder string) — this
// script exercises the REAL upload path including fileSignature.ts's
// magic-byte check, so it needs bytes that actually pass that check,
// same reasoning as e2e/fixtures/test-image.png in marketplace-v10.
const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde,
]).buffer;

export function setup() {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 200) {
    throw new Error(
      `setup() login failed with status ${res.status} — check LOAD_TEST_LOGIN_EMAIL/` +
        `LOAD_TEST_LOGIN_PASSWORD point to a real, active account. This single login counts ` +
        `against authRateLimit too (10/15min/IP) — if you've already spent that budget on ` +
        `auth-rate-limit.js in the same window, wait or use a different account.`,
    );
  }

  return { accessToken: res.json('data.tokens.accessToken') };
}

export default function (data) {
  const title = `Load Test Ad ${__VU}-${__ITER}-${Date.now()}`;

  // k6's documented multipart/form-data pattern: pass a plain object as
  // the request body, using http.file() for any field that's a file —
  // k6 handles the multipart boundary/encoding itself. This is the
  // standard, intended approach (see k6 docs: "Sending file uploads"),
  // deliberately used here instead of hand-building the multipart body,
  // which would be far more error-prone for something this script's
  // whole point is to get exactly right.
  const body = {
    title: title,
    description: 'وصف تجريبي لاختبار الحمل يحتوي على عدد كافٍ من الأحرف',
    price: '100',
    city: 'غزة',
    images: http.file(PNG_BYTES, 'load-test.png', 'image/png'),
  };

  const res = http.post(`${API}/ads`, body, {
    headers: { Authorization: `Bearer ${data.accessToken}` },
    tags: { name: 'POST /ads' },
  });

  createDuration.add(res.timings.duration);

  check(res, {
    'create: status 201 (or 429 if the rate limit was already spent this hour)': (r) =>
      r.status === 201 || r.status === 429,
  });

  if (res.status === 429) {
    // eslint-disable-next-line no-console
    console.warn(
      `createAdRateLimit hit at iteration ${__ITER} — this is expected once MAX_CREATIONS ` +
        `approaches 20/hour; if it happens well before that, something else is consuming the budget.`,
    );
  }

  sleep(1);
}
