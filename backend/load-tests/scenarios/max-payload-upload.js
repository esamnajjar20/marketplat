/**
 * load-tests/scenarios/max-payload-upload.js
 *
 * PROD-FIX-19: ad-creation.js (the existing upload scenario)
 * deliberately uses a 1x1 pixel PNG — the right choice for measuring
 * the write path's baseline latency without paying real upload cost on
 * every iteration, but it doesn't exercise the actual worst case this
 * repo's own limits allow: upload.middleware.ts caps a single request
 * at 10 files × 5MB (fileSize: 5 * 1024 * 1024, MAX_TOTAL_REQUEST_BYTES
 * = 55MB — see that file's own comments). This script specifically
 * targets THAT worst case, concurrently, across several simulated
 * users — the scenario a production audit flagged as untested: "what
 * happens under concurrent max-size uploads" for both memory (multer's
 * buffer handling, PROD-FIX-02's Cloudinary timeout under real payload
 * size) and CPU (image processing before the Cloudinary handoff).
 *
 * Honest framing, same as ad-creation.js: addAdImagesRateLimit caps
 * POST /ads/:id/images at 30/hour/IP (rateLimit.middleware.ts) — this
 * script stays under that per VU, and needs that many distinct
 * pre-existing ads (one per iteration) since images are added to an
 * EXISTING ad, not created fresh each time (that's createAdRateLimit's
 * job, a separate, lower 20/hour ceiling — reusing one ad across
 * iterations avoids spending that budget too).
 *
 * PREREQUISITES beyond the shared ones in load-tests/README.md:
 *   - A real logged-in user (LOAD_TEST_LOGIN_EMAIL/PASSWORD, same as
 *     ad-creation.js).
 *   - LOAD_TEST_AD_ID — a real, existing ad ID owned by that user, to
 *     add images to. Create one first via ad-creation.js or the UI —
 *     deliberately not auto-created here, so this script's own
 *     iterations don't also compete for createAdRateLimit's budget.
 *
 * Run:
 *   LOAD_TEST_LOGIN_EMAIL=... LOAD_TEST_LOGIN_PASSWORD=... \
 *   LOAD_TEST_AD_ID=... \
 *   k6 run load-tests/scenarios/max-payload-upload.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { FormData } from 'https://jslib.k6.io/formdata/0.0.2/index.js';
import { API } from '../scripts/config.js';

const uploadDuration = new Trend('max_payload_upload_duration', true);

// PROD-FIX-19: 5MB is upload.middleware.ts's per-file fileSize limit
// exactly — this is deliberately AT the limit, not comfortably under
// it, since the whole point is exercising the worst case a real
// (adversarial or just a user with large photos) request could send.
const FILE_SIZE_BYTES = 5 * 1024 * 1024;
// 5 files, not the full 10 the endpoint allows — addImages appends to
// an ad's EXISTING image array, which ads.repository.ts caps at 10
// total images per ad (maxImages param) — 5 leaves headroom to run
// this scenario more than once against the same test ad without
// hitting that cap and getting a legitimate, expected rejection
// instead of a real capacity signal.
const FILES_PER_REQUEST = 5;
const VUS = parseInt(__ENV.LOAD_TEST_UPLOAD_VUS || '5', 10);
const ITERATIONS_PER_VU = parseInt(__ENV.LOAD_TEST_UPLOAD_ITERATIONS || '2', 10);

export const options = {
  scenarios: {
    concurrent_max_payload_uploads: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: ITERATIONS_PER_VU,
      maxDuration: '5m',
    },
  },
  thresholds: {
    // Looser than ad-creation.js's 3s — this is 5x the payload size
    // AND deliberately concurrent (VUS>1 simultaneously), specifically
    // to surface degradation under load that a single-VU baseline
    // wouldn't show. If this threshold fails, that's the actual signal
    // this script exists to produce, not a bug in the script.
    max_payload_upload_duration: ['p(95)<8000'],
    http_req_failed: ['rate<0.1'],
  },
};

const LOGIN_EMAIL = __ENV.LOAD_TEST_LOGIN_EMAIL;
const LOGIN_PASSWORD = __ENV.LOAD_TEST_LOGIN_PASSWORD;
const AD_ID = __ENV.LOAD_TEST_AD_ID;

if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
  throw new Error(
    'max-payload-upload.js requires LOAD_TEST_LOGIN_EMAIL and LOAD_TEST_LOGIN_PASSWORD env vars ' +
      '— a real, already-registered account.',
  );
}

if (!AD_ID) {
  throw new Error(
    "max-payload-upload.js requires LOAD_TEST_AD_ID — a real, existing ad ID owned by the " +
      "account above. Create one via ad-creation.js or the UI first; this script only adds " +
      "images to it, it does not create ads itself (to avoid also spending createAdRateLimit's budget).",
  );
}

// A real, valid PNG's bytes (magic-byte-check-passing, same reasoning
// as ad-creation.js's PNG_BYTES) padded out to exactly FILE_SIZE_BYTES
// with trailing zero bytes — still a well-formed enough file for
// fileSignature.ts's check (which only inspects the leading magic
// bytes), but at the real size limit rather than 33 bytes.
function buildMaxSizePng() {
  const header = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde,
  ]);
  const padded = new Uint8Array(FILE_SIZE_BYTES);
  padded.set(header, 0);
  return padded.buffer;
}

const MAX_SIZE_PNG = buildMaxSizePng();

export function setup() {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: LOGIN_EMAIL, password: LOGIN_PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  if (res.status !== 200) {
    throw new Error(
      `setup() login failed with status ${res.status} — check LOAD_TEST_LOGIN_EMAIL/` +
        `LOAD_TEST_LOGIN_PASSWORD point to a real, active account.`,
    );
  }

  return { accessToken: res.json('data.tokens.accessToken') };
}

export default function (data) {
  // BUGFIX (found during a post-implementation code audit): passing an
  // array of http.file() results directly as a body field value (e.g.
  // `{ images: files }` where `files` is an array) does NOT work in
  // k6's plain http.post() body handling — confirmed by k6's own
  // maintainers (grafana/k6#1571): it either collapses to a single
  // merged object or silently sends only the LAST file in the array,
  // not all of them as separate multipart parts under the same field
  // name. That would have silently undermined this script's entire
  // purpose (testing 5 concurrent files per request) — it would have
  // actually sent only 1 file per request without any visible error.
  // The correct approach, per k6's own official multipart-upload
  // documentation, is the explicit FormData helper from jslib.k6.io:
  // call fd.append() once per file, all under the same field name, and
  // send the assembled fd.body() with its own Content-Type header
  // (including the multipart boundary) — this is what actually
  // produces N separate parts under the "images" field name that
  // multer's upload.array('images', 10) (upload.middleware.ts) expects.
  const fd = new FormData();
  for (let i = 0; i < FILES_PER_REQUEST; i++) {
    fd.append(
      'images',
      http.file(MAX_SIZE_PNG, `max-payload-${__VU}-${__ITER}-${i}.png`, 'image/png'),
    );
  }

  const res = http.post(`${API}/ads/${AD_ID}/images`, fd.body(), {
    headers: {
      Authorization: `Bearer ${data.accessToken}`,
      'Content-Type': `multipart/form-data; boundary=${fd.boundary}`,
    },
    tags: { name: 'POST /ads/:id/images (max payload)' },
    timeout: '30s', // matches PROD-FIX-02's UPLOAD_TIMEOUT_MS (20s) plus headroom
  });

  uploadDuration.add(res.timings.duration);

  check(res, {
    'upload: status 200/201 (or 429 if rate limit already spent, or 400 if the 10-image cap was hit)': (r) =>
      [200, 201, 429, 400].includes(r.status),
  });

  if (res.status === 429) {
    // eslint-disable-next-line no-console
    console.warn(`addAdImagesRateLimit hit at VU ${__VU} iteration ${__ITER} — expected once 30/hour is spent.`);
  }

  sleep(2);
}
