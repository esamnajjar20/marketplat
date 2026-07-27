import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for real, full-stack E2E — runs against the ACTUAL
 * Next.js app talking to the ACTUAL backend (marketplace-v10 +
 * backend-v9), which in turn talks to a real Postgres + Redis. Nothing
 * here is mocked; this is the layer of testing this project's own
 * README ("Known Technical Debt") flagged as the biggest coverage gap —
 * the only kind of test that would have caught the isNegotiable bug
 * (a value that only breaks once it round-trips through validation,
 * the database, and back through the real API response shape).
 *
 * PREREQUISITES (see e2e/README.md for the full walkthrough):
 *   1. Backend + Postgres + Redis running (e.g. `docker compose -f
 *      docker-compose.full.yml up -d` from the backend-v9 repo, or
 *      `docker-compose.dev.yml` if you're running the frontend outside
 *      Docker via `npm run dev`).
 *   2. E2E_BASE_URL / E2E_API_URL pointed at that stack (see .env.e2e.example).
 *   3. `npx playwright install --with-deps chromium` (browsers aren't
 *      installed by `npm install` — a separate step, and one this
 *      sandboxed environment can't perform: no network access to
 *      download browser binaries. Run this locally/in CI before `npm
 *      run e2e`.)
 */
const E2E_BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

// CI gets a single retry to absorb real infra flakiness (Cloudinary
// upload latency, DB connection pool contention under parallel
// workers) — local runs stay at 0 retries so a real bug fails loudly
// on the first try instead of being masked by a lucky rerun.
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Full E2E workers hit a real, shared Postgres — too much parallelism
  // causes unique-constraint collisions (e.g. two workers registering
  // the same generated email in the same millisecond) and connection
  // pool exhaustion against the backend's configured limit. Each test
  // file already generates unique emails/titles per-run (see
  // e2e/helpers/test-data.ts), so this is a safety margin, not the
  // only defense against collisions.
  workers: isCI ? 2 : undefined,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : [['html', { open: 'never' }], ['list']],

  use: {
    baseURL: E2E_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Arabic RTL app — locale affects date/number formatting assertions
    // (see e2e/helpers/assertions.ts) and matches what a real user's
    // browser would report.
    locale: 'ar-PS',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile viewport matters specifically for this app: MobileNav,
    // the mobile search row in PublicHeader, and the mobile ImageUpload
    // flow all only render/behave differently under a narrow viewport.
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 7'] },
      testMatch: /.*\.mobile\.spec\.ts/,
    },
  ],

  // Only starts a dev server automatically for local runs against a
  // manually-started backend; CI is expected to bring up the full
  // docker-compose stack itself (frontend included) and set
  // E2E_BASE_URL to point at it, skipping this entirely.
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: 'npm run build && npm run start',
        url: E2E_BASE_URL,
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});
