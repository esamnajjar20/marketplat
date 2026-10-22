# Frontend audit — after measurements

**Date:** 2026-10-22
**Branch:** `audit/refactor-20261022`
**HEAD at measurement:** `a2694690 fix(audit-privacy-02): disable hydration tracing in production`

| Metric | Baseline | After / current evidence |
|---|---|---|
| Package manager | npm lockfile; npm 11.19.0 | npm |
| Type-check | PASS | PASS (`npm run type-check`) |
| Lint | 4 errors / 54 warnings | 0 errors / 54 warnings |
| Production build | PASS; 71 routes; shared First Load JS 105 kB | PASS; 71 routes; shared First Load JS 105 kB |
| Full unit suite | 4,140 pass / 92 fail / 11 skipped | Not cleared: one later complete run before migration/stale fixes had 4,144 pass / 89 fail / 11 skipped; the later full run was interrupted and has no final summary |
| Focused offline unit tests | Not separately recorded | 16/16 pass (`swShellDurability` + `offlineStoragePressure`) |
| Error-boundary regression | Not present | 1/1 pass |
| Offline cache truth audit | Not recorded | 30/30 checks pass |
| Chromium E2E | Browser initially blocked; 268-test rerun interrupted while source was changing | 20/20 focused smoke tests pass in 57.6s |
| Cross-browser/mobile E2E | Chromium baseline only attempted | Not executed; current config lacks requested Firefox/WebKit/Safari/tablet projects |
| Shared First Load JS | 105 kB | 105 kB |
| Lighthouse | Not measured; no usable browser baseline at preflight | Not measured; no Lighthouse run |

The production build reports unchanged route bundle values: `/admin` 340 kB First Load JS, `/offline` 280 kB, `/stores/[id]` 323 kB, `/products/[id]` 299 kB. The refactors in this task focus on offline durability and production diagnostics privacy, not bundle optimization.

**Release gate:** blocked pending resolution of the full unit suite and the requested full cross-browser/a11y/visual E2E program. Do not infer a clean overall suite from the passing targeted checks.
