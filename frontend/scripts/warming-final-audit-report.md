# Final Warming System Audit — W0 → W9 + Hardening

## Scope

This audit covers the client offline/core/route/personal/user-data warming path, the Service Worker cache contract, build-time route assets, adaptive network budgets, usage-based prioritisation, telemetry, and backend public Redis keep-warm.

## Confirmed hardening applied

- One client warming engine owns phase ordering and admission.
- Adaptive network budgets cover requests, bytes, duration, route count, personal-route count, and image eligibility.
- Runtime request/byte admission now applies inside core, route-shell, and user-data fetches; it is not only an estimate at job level.
- Warming jobs fail independently; one broken phase cannot abort the remaining lower-priority phases.
- Pipeline `ran` now reflects actual engine work instead of always returning `true` after entering the pipeline.
- React Query contracts distinguish exact UI-consumed query/key pairs from intentional Cache-Storage-only warming requests.
- Redundant self/profile endpoints were removed from the user-data warming list because `offlineSelfWarm` already owns them.
- Build-time route asset manifest handles App Router route groups and is regenerated after `next build`.
- The runtime manifest uses `no-store`, and Next serves it with `no-cache/no-store` to prevent stale hashed-chunk references after deployment.
- Service Worker and TypeScript cache-version constants were synchronized and bumped to `v47` because the deployed baseline was internally inconsistent (`sw.js` was `v45`, source was `v46`).
- A dependency-free final static audit script was added for CI/regression protection.
- Unit coverage was added for the runtime budget and updated for the query contract.

## Deliberately preserved behaviour

- Atomic route warming and visit-wins semantics remain intact.
- Cross-tab Web Locks/localStorage coordination remains intact.
- Queue replay keeps priority over background warming.
- Storage-pressure and network-policy gates remain intact.
- Personal HTML stays in the personal cache and is not moved into the shared public shell cache.
- RSC warming remains best-effort; the system does not claim that an arbitrary speculative RSC response is a complete substitute for a real Next Router State Tree.

## Validation performed in this environment

- Final dependency-free warming audit: **PASS**.
- Targeted TypeScript scan of all warming files: **0 warming-file errors** after fixes.
- JavaScript build/audit scripts are syntactically runnable with Node.
- Full project type-check and Vitest/E2E execution were **not** claimed because project `node_modules` are not installed in this environment.
- The global `tsc` output therefore contains unrelated dependency/type-resolution errors from the uninstalled project dependencies; those were not attributed to this warming patch.

## Production validation still required

Run the project's normal `npm install`, then:

1. `npm run type-check`
2. `npm test -- --run` (or the project's normal Vitest command)
3. `npm run build`
4. `npm run e2e` against the real backend/Redis/Postgres stack
5. Verify offline hard navigation and soft navigation on Chromium + mobile Safari/Chrome.
6. Compare warming telemetry/Prometheus metrics before and after deployment.

The final audit is intentionally conservative: no runtime performance improvement is claimed until those production-like measurements exist.
