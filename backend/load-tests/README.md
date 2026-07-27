# Load Testing (k6)

Real k6 scripts targeting the actual running backend — not simulated,
not a description of what a load test would do.

PROD-FIX-08: these scripts had never actually been executed against a
live server in the environment they were originally written in (no
network access to install k6 or reach a running instance) — that
constraint hasn't changed here either, so no numbers in this file are
claimed to be verified results. What HAS changed: there is now a
`.github/workflows/load-test.yml` manual-dispatch CI job that actually
runs a chosen scenario against a real target URL you provide and
uploads the results — the mechanism to go from "these scripts exist"
to "here are real numbers" now exists, it's just not been exercised in
this environment. Treat every threshold in these files as a starting
point to validate on your first real run.

## Prerequisites

1. **k6** itself — a single static binary, not an npm package:
   ```bash
   # macOS
   brew install k6
   # Linux
   sudo gpg -k
   sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
   echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
   sudo apt-get update && sudo apt-get install k6
   # or see https://k6.io/docs/get-started/installation/ for other platforms
   ```
2. A running backend + Postgres + Redis — see the main `README.md`'s
   Docker section, or `docker-compose.full.yml`.
3. **A non-trivial amount of seed data.** `GET /ads` against an empty
   table tells you nothing about real query/index performance under
   load — either run `npm run seed:e2e` (small, fixed dataset — enough
   to exercise the code paths but not enough to be a realistic capacity
   test) or seed a larger, more realistic volume of ads yourself before
   running `browsing.js`/`search.js` for real capacity numbers.

**Run this against a dedicated load-test environment, never
production, and ideally not your shared dev/staging DB either** —
`ad-creation.js`, `max-payload-upload.js`, and
`connection-pool-stress.js`'s setup() all create real rows.

## What's here

| Script | Tests | Notes |
|---|---|---|
| `scenarios/browsing.js` | `GET /ads`, `GET /ads/:id` | The core read-heavy capacity test — no rate limit on these routes, so this is where real concurrent-user numbers matter |
| `scenarios/search.js` | `GET /ads/search` | Full-text search (GIN index) — separate from browsing.js since it's a different query plan/cost |
| `scenarios/auth-rate-limit.js` | `POST /auth/login` | Tests the RATE LIMITER's correctness under concurrency, not login throughput (see the script's own header comment for why those are different questions) |
| `scenarios/ad-creation.js` | `POST /ads` | Deliberately capped well under createAdRateLimit's 20/hour/IP ceiling — measures real write-path latency (including a genuine Cloudinary upload) with a minimal 1x1px image, explicitly does NOT claim to test creation "at scale" |
| `scenarios/max-payload-upload.js` | `POST /ads/:id/images` | PROD-FIX-19: the specific concurrent-max-size-upload scenario a prior audit flagged as untested — 5 files × 5MB per request (upload.middleware.ts's real per-file limit), fired concurrently across several VUs, to surface memory/CPU/Cloudinary-timeout behavior that a small test image can't |
| `scenarios/connection-pool-stress.js` | `GET /ads/me` | Targeted probe for the PM2-cluster × Prisma-pool-size vs. Postgres max_connections capacity question raised (but never empirically tested) in `capacityCheck.ts` |

## Running

```bash
# From backend-v9/
k6 run load-tests/scenarios/browsing.js
k6 run load-tests/scenarios/search.js

# Requires a real account's credentials (see each script's header comment)
LOAD_TEST_LOGIN_EMAIL=you@example.test LOAD_TEST_LOGIN_PASSWORD=yourpass \
  k6 run load-tests/scenarios/ad-creation.js

# max-payload-upload.js additionally requires a real, existing ad ID
# (create one first via ad-creation.js or the UI):
LOAD_TEST_LOGIN_EMAIL=you@example.test LOAD_TEST_LOGIN_PASSWORD=yourpass \
  LOAD_TEST_AD_ID=<a real ad id> \
  k6 run load-tests/scenarios/max-payload-upload.js

# Point at a different environment
LOAD_TEST_BASE_URL=http://staging:5000 k6 run load-tests/scenarios/browsing.js

# Or trigger any scenario from GitHub Actions instead of locally —
# see .github/workflows/load-test.yml (Actions tab -> "Load Test (k6, manual)"
# -> Run workflow -> supply the target base_url and pick a scenario).

```

Run `auth-rate-limit.js` **in isolation**, not in the same 15-minute
window as other scenarios that also hit `/auth/*` — it deliberately
exhausts that limiter for its own test IP (see its own header comment).

### Getting an HTML/JSON report instead of just terminal output

```bash
k6 run --out json=results.json load-tests/scenarios/browsing.js
# or, for a quick summary export:
k6 run --summary-export=summary.json load-tests/scenarios/browsing.js
```

k6 also has a hosted cloud option (`k6 cloud`) for distributed,
multi-IP load generation — relevant specifically for
`ad-creation.js`'s "how do I actually test creation at scale" question,
since that requires many IPs to get past the per-IP rate limit
honestly (see that script's own comment).

## What these numbers actually tell you (and what they don't)

- A clean run of `browsing.js`/`search.js` at your target VU count
  tells you those two endpoints hold up **on whatever machine and
  Postgres/Redis configuration you ran this against** — it says
  nothing about a different deployment size, and nothing about
  sustained load over hours (these scenarios run for a few minutes;
  connection leaks or memory growth that only show up after sustained
  hours of traffic won't appear here).
- `auth-rate-limit.js` passing (succeeded count near 10, not
  dramatically higher) confirms the rate limiter's Redis-backed
  counting is correct **under this specific concurrency level and this
  specific network's latency characteristics** — a much higher
  concurrency burst, or a network with very different latency to
  Redis, could theoretically still expose an edge case this run
  didn't.
- `connection-pool-stress.js` finding a clean result (no cliff) at 150
  VUs on your test machine does NOT mean production, likely running on
  different hardware with a different core count (and therefore a
  different real PM2 instance count × connection_limit total), is
  automatically fine — re-run this against infrastructure that matches
  production's actual specs before trusting the result for a real
  capacity decision.

## What's NOT covered here

- **Sustained/soak testing** (hours, not minutes) — connection leaks,
  memory growth, or Redis key accumulation (e.g. `viewsBuffer.ts`'s
  buffered view-count writes, or rate-limit-redis's own key TTLs) that
  only manifest over a long run aren't exercised by any script here.
- **Redis failure/degraded-mode load** — `capacityCheck.ts` and several
  services (ads list caching, rate limiting) have explicit fail-open/
  fail-closed behavior for a Redis outage; nothing here tests what
  happens to latency/error rate under load *while Redis is down or
  slow*, only under normal operation.
- **Realistic geographic latency** — all scripts here assume k6 runs
  close to the target (low network latency); if your real users are
  geographically distant from the backend, these numbers will be more
  optimistic than reality.
- **The frontend's own performance under load** — this suite only
  targets `backend-v9`'s API directly. `marketplace-v10`'s SSR/ISR
  behavior, image optimization pipeline, and CDN caching under
  concurrent traffic are a separate, unaddressed question.
