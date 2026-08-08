/**
 * PROD-FIX-17: previously there was no standalone smoke test — the
 * closest things were the full k6 load-test suite (load-tests/,
 * deliberately heavier and disruptive, not meant to run on every
 * deploy) and Playwright's E2E suite (marketplace-v10/e2e, needs a
 * browser and a running frontend). Neither is the right tool for "did
 * this deployment come up correctly" — a single fast script that hits
 * a handful of critical endpoints and exits non-zero on failure,
 * cheap enough to run after every single deploy without hesitation.
 *
 * Deliberately NOT part of the Jest suite (tests/) — this hits a real
 * running server over the network, which is a different contract than
 * everything else under tests/ (unit tests mock Redis, integration
 * tests use Prisma directly against a test DB, but neither makes real
 * HTTP requests against a deployed instance).
 *
 * Usage:
 *   npm run build
 *   SMOKE_TEST_BASE_URL=https://api.example.com npm run smoke-test
 *   # or, against a local instance:
 *   SMOKE_TEST_BASE_URL=http://localhost:5000 npm run smoke-test
 *
 * Exits 0 if every check passes, 1 (with details of which check(s)
 * failed) otherwise — suitable as a deploy-pipeline gate
 * (`npm run smoke-test || rollback.sh`).
 */

const BASE_URL = process.env.SMOKE_TEST_BASE_URL || "http://localhost:5000";
const TIMEOUT_MS = 10_000;

interface Check {
  name: string;
  run: () => Promise<void>;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const checks: Check[] = [
  {
    // Liveness — matches health.routes.ts's /health: process is up,
    // no dependency checks. If this fails, nothing else will pass either.
    name: "GET /health returns 200",
    run: async () => {
      const res = await fetchWithTimeout(`${BASE_URL}/health`, TIMEOUT_MS);
      if (!res.ok) throw new Error(`Expected 200, got ${res.status}`);
    },
  },
  {
    // Readiness — actually checks Postgres + Redis connectivity
    // (see healthCache.ts / health.routes.ts), the real "is this
    // deployment usable" signal, not just "is the process alive."
    name: "GET /ready returns 200 (DB + Redis reachable)",
    run: async () => {
      const res = await fetchWithTimeout(`${BASE_URL}/ready`, TIMEOUT_MS);
      if (!res.ok) {
        const body = await res.text().catch(() => "<unreadable body>");
        throw new Error(`Expected 200, got ${res.status}. Body: ${body}`);
      }
    },
  },
  {
    // A real, unauthenticated, read-only API route — confirms the
    // Express app + Prisma + the ads module's query path all actually
    // work end-to-end, not just that the process is listening.
    name: "GET /api/v1/ads returns a paginated list",
    run: async () => {
      const res = await fetchWithTimeout(
        `${BASE_URL}/api/v1/ads?page=1&limit=1`,
        TIMEOUT_MS,
      );
      if (!res.ok) throw new Error(`Expected 200, got ${res.status}`);
      const body = (await res.json()) as { success?: boolean; data?: unknown };
      if (body.success !== true) {
        throw new Error(
          `Expected success:true in response body, got: ${JSON.stringify(body)}`,
        );
      }
    },
  },
  {
    // Categories are read on nearly every page (AdForm's category
    // <select>, CategoryGrid) — a broken categories endpoint would
    // break the frontend even if /api/v1/ads itself were fine.
    name: "GET /api/v1/categories returns a category tree",
    run: async () => {
      const res = await fetchWithTimeout(
        `${BASE_URL}/api/v1/categories`,
        TIMEOUT_MS,
      );
      if (!res.ok) throw new Error(`Expected 200, got ${res.status}`);
    },
  },
  {
    // Confirms auth middleware/rate limiting are actually wired up —
    // an unauthenticated request to a protected route should be
    // rejected with 401, not 500 (which would mean the auth stack
    // itself is broken) or 200 (which would mean auth isn't enforced
    // at all — far worse).
    name: "GET /api/v1/ads/me without a token returns 401 (auth enforced)",
    run: async () => {
      const res = await fetchWithTimeout(
        `${BASE_URL}/api/v1/ads/me`,
        TIMEOUT_MS,
      );
      if (res.status !== 401) {
        throw new Error(
          `Expected 401 (auth should be enforced), got ${res.status}`,
        );
      }
    },
  },
];

async function main(): Promise<void> {
  console.log(`Running smoke tests against ${BASE_URL}\n`);

  const results: { name: string; ok: boolean; error?: string }[] = [];

  for (const check of checks) {
    try {
      await check.run();
      results.push({ name: check.name, ok: true });
      console.log(`✅ ${check.name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ name: check.name, ok: false, error: message });
      console.error(`❌ ${check.name}`);
      console.error(`   ${message}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`,
  );

  if (failed.length > 0) {
    console.error(
      `\n${failed.length} smoke test(s) failed — deployment is likely unhealthy.`,
    );
    process.exit(1);
  }

  console.log("\nAll smoke tests passed.");
}

main().catch((err) => {
  console.error("Smoke test runner crashed unexpectedly:", err);
  process.exit(1);
});
