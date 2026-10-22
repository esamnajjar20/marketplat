# Frontend architecture audit — baseline

**Date:** 2026-10-22
**Branch:** `audit/refactor-20261022`
**HEAD:** `94e157e3 feat(pwa): v88 offline overhaul, navigation deadlines, and worker security`
**Preflight worktree:** clean before baseline commands. No `.env`, secrets, CI, or infrastructure files were changed.

## Tooling and E2E availability

- **Package manager:** npm 11.19.0; `frontend/package-lock.json` exists. pnpm 12.3.4 is installed but there is no pnpm lockfile, so npm is the reproducible choice.
- **Playwright:** `@playwright/test` 1.64.0 and `frontend/playwright.config.ts` already exist; 39 spec files are present. The current config defines `chromium` and `mobile-chromium` only.
- **Cypress:** not installed/configured.
- **axe integration:** `@axe-core/playwright` is not installed.
- **Browsers:** Playwright Chromium, Firefox, WebKit binaries were downloaded for this audit. Browser launch is blocked by host libraries (first missing `libatk-1.0.so.0`); this user has no sudo privileges. No browser test ran successfully at baseline.
- **Lighthouse:** no installed Lighthouse package. A reliable score requires a working browser; therefore no baseline score is claimed.

## Baseline commands

| Check | Result | Evidence |
|---|---|---|
| `npm run type-check` | **PASS** | `tsc --noEmit`, exit 0 |
| `npm run lint` | **FAIL** | 4 errors, 54 warnings; errors include `components/shared/DevErrorBoundary.tsx:2` and `scripts/loading-system-audit.mjs:74-75` |
| `npm run build` | **PASS** | Next.js production build and warming manifest generation exit 0 |
| `npm test -- --reporter=dot` | **FAIL** | 4,140 passed, 92 failed, 11 skipped; 434 passing and 40 failing test files (4,243 tests total) |
| `E2E_BASE_URL=http://127.0.0.1:3127 npx playwright test --project=chromium` | **BLOCKED / FAIL** | 258 failed to launch, 10 did not run; Chromium exits because `libatk-1.0.so.0` is unavailable. This is an infrastructure failure, not evidence about the app assertions. |
| Production server boot | **PASS** | `npm run start -- --hostname 127.0.0.1 --port 3127`; `GET /` returned HTTP 200, 269,618 bytes, 0.375 s TTFB |

## Baseline bundle and route inventory

- Next build reports **71 App Router page modules** and shared First Load JS of **105 kB** (46.2 kB + 54.2 kB + 4.33 kB reported chunks).
- Example route First Load JS from build output: `/` 238 kB; `/admin` 340 kB; `/offline` 280 kB; `/stores/[id]` 323 kB; `/products/[id]` 299 kB.
- `.next/static/chunks` occupies **6.8 MB** on disk; this is an artifact-size measurement, not a compressed transfer estimate.
- No Lighthouse metric is available at baseline because the browser cannot launch on this host.

## Full command logs

Raw command output was captured during the baseline run in `/tmp/audit-baseline-{typecheck,lint,unit,build,e2e}.log`. Playwright wrote diagnostic traces and error contexts under ignored `frontend/test-results/`. These temporary logs are not deliverables and are not tracked.
