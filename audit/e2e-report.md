# E2E Audit and Execution Report

**Date:** 2026-10-22
**Branch:** `audit/refactor-20261022`
**Stack:** Playwright 1.64.0; Cypress is not installed.

**Final state:** A 20-test Chromium smoke selection passed against the production build. The full requested E2E expansion was not started because the mandatory pre-E2E gate is blocked by the existing full unit suite (a complete run has dozens of failures and the later run did not complete). No new E2E spec, axe integration, cross-browser project, visual baseline, or LCP threshold is claimed.

## 1. Test Inventory

There are 39 existing spec files under `apps/web/e2e/tests/`. Existing suites cover root/public document health, auth input validation and unauthenticated route guards, search/navigation/history, responsive overflow, API/network degradation, storage resilience, and offline connectivity/SW queue behavior. Several `missing-business-journeys-mocked.spec.ts` tests exercise CRUD-like paths but depend on authenticated/seeded backend state; names and fixtures should be reconciled before treating them as deterministic. This run added no new Playwright spec because Phase 3 was gated on a clean full unit suite.

| Spec group | Files / examples | Status |
|---|---|---|
| Boot, route health, metadata, 404 | `marketplace-smoke`, `public-runtime-health`, `document-integrity`, `route-health-and-metadata`, `route-query-and-not-found`, `advanced-route-contracts` | PARTIAL — samples routes; no forced React error-boundary test |
| Auth and protected routes | `auth-form-validation`, `auth-accessibility-and-boundaries`, `protected-route-guards`, `missing-business-operations-gates` | PARTIAL — validation/guards covered; successful login/logout/session persistence require apps/api/auth fixtures |
| Search, navigation, history | `search-journeys`, `search-and-resilience`, `native-filters`, `browser-history-navigation`, `ci-regression-round3` | PARTIAL — broad search coverage; not every top-level route/feature flow |
| Offline/network/cache | `offline-connectivity`, `offline-phase8.integration`, `offline-phase9-queue-isolation`, `network-degradation-matrix`, `network-failure-recovery`, `cache-storage-resilience` | PARTIAL — connectivity and some SW queue flows; controller-dependent tests skip, no optimistic rollback contract |
| Keyboard/responsive | `accessibility-and-responsive`, `form-keyboard-accessibility`, `keyboard-and-focus-regression`, `responsive-interaction-matrix` | PARTIAL — selected fields/routes/viewports; not all dialogs/dropdowns or requested tablet/Safari devices |
| Security boundaries | `security-input-boundaries`, `search-security-and-edge-cases`, `security-anchor-audit`, `deep-regression` | PARTIAL — selected URL/XSS/anchor assertions |
| CRUD/business operations | `missing-business-journeys-mocked`, `missing-business-operations-gates` | UNTESTABLE-AS-IS for repeatable CI without a deterministic auth seed/backend fixture |

## 2. Coverage Matrix

| Flow / quality bar | State | Evidence / gap |
|---|---|---|
| App boot and root renders | COVERED | Root document/title/main assertions exist. |
| Every top-level route reachable from nav | PARTIAL | Navigation is tested on public examples; no complete route-to-nav inventory assertion. |
| 404 / not-found | COVERED | Multiple unknown-route recovery specs. |
| Force an error and verify `error.tsx` | MISSING | No deliberate error injection found. |
| Loading fallback to content / CLS | MISSING | No fallback-swap or layout-shift assertion. |
| Login form validation | COVERED | Auth form validation suite. |
| Successful login/logout/session persistence | PARTIAL | Successful auth flows depend on seeded backend; no storage-state global setup. |
| Protected route redirect | COVERED | Unauthenticated guard specs. |
| Each CRUD flow | PARTIAL | Some seeded/mock-like business journeys; not a deterministic isolated fixture suite. |
| Every form: happy, validation, server error | MISSING | Auth forms are covered; feature forms and server-error states are not exhaustive. |
| Modals: ESC/backdrop/focus trap/focus return | MISSING | No systematic modal lifecycle test. |
| Dropdown/combobox keyboard and ARIA state | PARTIAL | A few tab/search keyboard checks; no exhaustive dropdown matrix. |
| Toast appears and dismisses | MISSING | No dedicated assertion found. |
| Offline cached render | PARTIAL | SW-dependent landing/reload tests exist; some conditionally skip unless controlled. |
| Reconnect background refetch | PARTIAL | Connectivity transition tests exist, but do not assert query refetch deterministically. |
| Failed optimistic mutation rollback | MISSING | No E2E coverage found. |
| Locale switch | N-A | No locale-switching support identified; the app currently declares Arabic. |
| RTL layout | COVERED | HTML `lang`/`dir` checks. |
| Dark/light preference persistence | MISSING | No theme toggle persistence test. |
| Responsive mobile/tablet | PARTIAL | Mobile widths are sampled; no tablet or mobile-Safari project. |
| Cross-browser Chromium/Firefox/WebKit | MISSING | Only Chromium and mobile Chromium projects are configured. |
| axe serious/critical accessibility scan | MISSING | `@axe-core/playwright` is not installed or used. |
| Visual regression on five core pages | MISSING | No `toHaveScreenshot()` tests/baselines. |
| Home LCP smoke threshold | MISSING | No Largest Contentful Paint assertion. |
| Fail on any console error | PARTIAL | Two specs collect page errors locally; no global `console.error` hook. |
| No `test.only` / hard waits | COVERED | Static scan found none. |
| No unexplained skips | PARTIAL | Two conditional service-worker skips explain the requirement in their test messages; report entries/comments are not standardized. |

## 3. Configuration and Testability Gaps

- `apps/web/playwright.config.ts:22-35` defines only `chromium` and `mobile-chromium`; no Firefox, WebKit, mobile Safari, or tablet.
- The config has retries `2` in CI and `0` locally, `fullyParallel`, and trace/video/screenshot retention. Trace is `retain-on-failure`, not `on-first-retry`.
- `webServer` always runs `npm run build && npm run start`; the build warns `next start` is incompatible with `output: 'standalone'`. There is no dev-vs-CI server selection.
- `apps/web/e2e/` has no `fixtures/`, `pages/`, or `helpers/` directories and no `global-setup.ts`; tests are directly in `e2e/tests`.
- No global `page.on('console')` rejection exists. Only two specs attach local `pageerror` listeners.
- Tests are backend-dependent unless each test installs its own `page.route()` mock; no stable shared seed/auth fixture was found.
- Fixed URLs/backends and real auth seed availability must be controlled before classifying CRUD journeys as repeatable CI coverage.

## 4. Execution Results

### Baseline

The original Phase 0 run could not launch Chromium because the host lacked `libatk-1.0.so.0`; the missing host libraries were installed and Chromium launch was verified as version `156.0.8078.4`. The production server was started on port 3131 and returned HTTP 200.

The successful focused run used:

```sh
cd apps/web
E2E_BASE_URL=http://127.0.0.1:3131 npx playwright test --project=chromium \
  e2e/tests/marketplace-smoke.spec.ts \
  e2e/tests/route-query-and-not-found.spec.ts --reporter=line
```

**Result: 20 passed, 0 failed, 0 skipped; runtime 57.6 seconds; one worker.** It exercises 13 public routes, page title/main landmark, auth form presence, unauthenticated guards for five protected routes, a mobile overflow sample, six query-string routes, 404 destinations, and an XSS-shaped search input. Raw output is saved at `audit/e2e-logs/chromium-smoke.log`.

The broader original Chromium run reported 268 tests; it was interrupted after 58 successes because it read `public/sw.js` while that file was being edited. That run is invalid as a final E2E result and is not counted. Full Chromium, Firefox, WebKit, mobile, and tablet runs remain unexecuted.

### Required quality bars

| Project | Pass | Fail | Flaky | Skipped | Runtime |
|---|---:|---:|---:|---:|---|
| chromium focused smoke | 20 | 0 | 0 | 0 | 57.6s |
| chromium full suite | Not run to completion | — | — | — | — |
| firefox | Not configured | — | — | — | — |
| webkit | Not configured | — | — | — | — |
| mobile-chromium | Configured only for `*.mobile.spec.ts`; no matching files found | — | — | — | — |
| mobile-safari | Not configured | — | — | — | — |
| tablet | Not configured | — | — | — | — |

A11y, visual, and LCP metrics are not available because those checks do not exist in the current suite. No results will be fabricated.

## 5. Failure Triage

The original browser-launch failure is classified as ENV/INFRA and required host libraries were installed. A first smoke attempt passed all 20 tests but failed to capture the log because `audit/e2e-logs/` did not yet exist; after creating the directory, the exact selection was rerun and again passed 20/20, with output captured. No application failures were observed in this selected run.

## 6. Pending Decisions and Blockers

- The mandatory Phase 3 gate remains blocked by the full unit suite: baseline recorded 92 failures; the later completed run before the last fixes reported 89 failures, and a subsequent full run was stopped after roughly 12 minutes without a final summary. Focused offline tests are green; do not treat them as a substitute for the full gate.
- Baseline lint errors were fixed; final lint exits 0 with 54 warnings. Type-check and build pass.
- Business-flow specs need an isolated auth/backend seed or complete route-level API mocks before those tests can be called deterministic.
- If user-facing locale switching is not a product requirement, locale-switching coverage remains N-A; no new behavior is assumed.
- `audit/e2e-a11y.json` records `not_run`; axe is not installed and no all-pages scan was executed. Visual baselines and HTML full-suite reporting are likewise not claimed.

## 7. Running Locally

From `apps/web/`:

```sh
npm run e2e -- --project=chromium
npm run e2e
npm run e2e:report
```

The current local webServer builds and starts the production output. Until the config is corrected, Next prints a standalone-output warning. CI can set `CI=1` for two retries and the configured worker cap.
