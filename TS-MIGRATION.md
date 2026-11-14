# JS → TS migration notes

- `.mjs→.mts`, `.cjs→.cts`, `.js→.ts` for 207 files; run directly with `node file.mts` (Node >= 22.18, engines bumped).
- Kept as JS (runtime/tool constraints): `frontend/public/*.js`, `frontend/lib/vendor/jsQR.js`, `apps/api/load-tests/**` (k6), `ecosystem.config.js`, mobile `metro/app.config`, plugins, `.eslintrc.cjs`, `postcss/eslint.config.mjs`.
- Deleted stale `workers/cf-api-proxy/worker.js` (real worker is `worker.ts`).
- `apps/mobile/src/storage`: pure helpers merged into plain `.ts`; `.mjs`/`.d.mts` mirrors removed.
- `tsconfig.scripts.json` (run: `tsc -p tsconfig.scripts.json`) type-checks all `.mts/.cts`. 64 files carry `// @ts-nocheck` (leftover inferred-type errors) - remove gradually.
- Pre-existing failing audits (also fail before migration): gateway-proxy-audit, network-request-monitor-audit, api-batching-phase8-audit, sales-report-idempotency-audit, rsc-boundary-phase4-audit.
