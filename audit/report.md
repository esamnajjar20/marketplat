# Frontend Architecture Audit

**Date:** 2026-10-22
**Branch:** `audit/refactor-20261022`
**Audit baseline HEAD:** `94e157e3 feat(pwa): v88 offline overhaul, navigation deadlines, and worker security`

## 1. Executive Summary

The frontend builds and type-checks; lint errors were reduced from four to zero. The initial inventory found 584 client-marked files, 55 TS/TSX files over 300 lines, and an E2E suite with 39 specs but only Chromium/mobile-Chromium configuration. Focused fixes were committed for bounded shell retries/recovery notices, cache migration of recent public and personal shells, explicit-gesture-only persistent storage requests, and production diagnostic privacy. Offline cache guardrails pass 30/30 and focused regression tests pass. The full unit suite remains blocked by numerous existing failures; only a 20-test Chromium smoke selection was completed. This is a scoped architecture audit and prioritized handoff, not a per-file approval of every UI module; the requested exhaustive `"use client"` justification, every-string localization review, CRUD E2E matrix, all-browser coverage, axe and visual testing remain outstanding. This branch is not ready for production sign-off.

## 2. Issue Table

| ID | Severity | File:Line | Description | Status | Commit SHA |
|---|---|---|---|---|---|
| OFFLINE-01 | HIGH | `apps/web/public/sw.js:828-1012,1065-1083,3329-3339` | The current branch had no bounded queue/retry handler or shell-result notification; retry requests were a no-op. Restored a persisted queue (30 items, 5 attempts, 24h, batches of 5), sync/activation/client retry triggers, and recovery-only `saved` notices. | FIXED | `0144f97a` |
| OFFLINE-02 | MEDIUM | `apps/web/components/pwa/OfflineBootstrap.tsx` (removed delayed persist effect; previous lines 239-248) | Persistent storage was requested four seconds after authenticated/standalone page load. Removed the load-time request; only the explicit offline-settings action requests persistence. | FIXED | `b3fe96a6` |
| OFFLINE-03 | HIGH | `apps/web/public/sw.js:140-330` | The active shell migration copied only fresh/permanent pages and had incorrect personal-shell eligibility; recent visited pages and their chunks were lost across version bumps. Restored age/count-bounded recent-shell migration with referenced static assets and protected-cache separation; bumped version to v91. | FIXED | `2328b957` |
| OFFLINE-04 | MEDIUM | `apps/web/public/sw.js:2038-2076,2082-2162` | Public shared API snapshots past their hard TTL were deleted without a grace fallback although the existing UI/tests expect a stale notice path. Restored a validated, shared-only seven-day grace and client notice; user-scoped data keeps its hard TTL; bumped version to v92. | FIXED | `bc90fd70` |
| PRIVACY-01 | MEDIUM | `apps/web/app/layout.tsx:198-201`, `apps/web/public/hydration-trace.js:1-77` | The DOM `MutationObserver` diagnostic recorded text and attribute mutation snippets on every production page for 15 seconds. The root layout now includes it only outside production. | FIXED | `a2694690` |
| PRIVACY-02 | MEDIUM | `apps/web/components/shared/DevErrorBoundary.tsx:7-31` | The boundary transmitted raw error/component stacks and rendered exception details in production. It now displays generic recovery UI, and reports details to console only in development. | FIXED | `9b94a3b4`; regression test `893dd039` |
| RENDER-01 | MEDIUM | `apps/web/app/layout.tsx:190-193` | The root layout reads request cookies and headers to pass the CSP nonce, making all descendant routes request-rendered rather than statically cached. This is a deliberate nonce/theme tradeoff, but it removes static rendering as an optimization for public routes and should be evaluated against a per-request CSP design. | DOCUMENT | — |
| SEO-01 | MEDIUM | `apps/web/app/sitemap.ts:43-44` | `dynamic = 'force-dynamic'` conflicts with the adjacent six-hour `revalidate` intent: the route is forced to render dynamically, so the comment does not describe the effective Next.js caching behavior. | OPEN | — |
| QUALITY-01 | HIGH | `apps/web/playwright.config.ts:1-45`, `apps/web/e2e/tests/` | 39 existing specs use two projects only; no axe, visual snapshots, LCP assertion, global console-error gate, POM/fixtures/global setup, Firefox/WebKit, mobile Safari, or tablet. The 20-test Chromium smoke selection passed, but requested coverage is not implemented. | BLOCKED | — |
| QUALITY-02 | HIGH | `apps/web/__tests__/` | Baseline unit results were 92 failing tests (4,140 pass, 11 skipped). A later complete run before the migration/stale fixes reported 89 failed / 4,144 passed / 11 skipped; the final full suite was started but interrupted after a prolonged run and has no valid final result. Targeted offline tests pass 16/16; full unit gate is unresolved. | BLOCKED | — |
| QUALITY-03 | MEDIUM | `apps/web/app/api/admin/debug-toggle/route.ts`, `apps/web/components/shared/DevErrorBoundary.tsx`, `apps/web/scripts/loading-system-audit.mjs` | Baseline lint had four errors / 54 warnings. Fixed the type-only imports and unused callback bindings; lint now exits 0 with 54 pre-existing warnings. | FIXED | `44b0f314` |
| SCALE-01 | MEDIUM | `apps/web/components/` and `apps/web/app/` | 55 TS/TSX files exceed 300 lines; the largest include `ProductForm.tsx` (859), `ServiceListingForm.tsx` (812), `SyncCenterClient.tsx` (787), `AdForm.tsx` (773), `OfflineRoutesList.tsx` (769), `OfflineHub.tsx` (728), and `ChatWindow.tsx` (718). This raises change-coupling and testing costs; no broad rewrite is recommended without feature-specific tests. | DOCUMENT | — |
| TYPE-01 | LOW | See `audit/type-escape-hatches.txt` | The source inventory contains 6 `as any` sites and one `@ts-ignore`; strict TypeScript is enabled. The listed casts should be replaced with narrow domain types as those modules are refactored. | DOCUMENT | — |
| TEST-INFRA-01 | MEDIUM | `apps/web/playwright.config.ts:37-42` | Local and CI E2E both run `npm run build && npm run start`; Next warns that `next start` is unsupported with `output: 'standalone'`. The server responds, but the harness should use the generated standalone server and explicitly choose the local/CI mode. | OPEN | — |

## 3. Applied Fixes Log

| Commit | Issue | Change / verification |
|---|---|---|
| `b3fe96a6` | STORAGE-01 | Removed delayed bootstrap persistence request; static guardrail now requires the explicit offline-settings action. |
| `0144f97a` | OFFLINE-01 | Restored bounded pending-shell retry queue and recovery-only status notifications; targeted retry tests and cache truth audit pass. |
| `3c28ca94` | OFFLINE-01 test | Added the first-visit assertion: initial successful cache does not emit `saved` or leave a pending marker. |
| `2328b957` | OFFLINE-03 | Restored safe version migration of recent visited public/personal shells and their referenced assets; migration tests pass. |
| `bc90fd70` | OFFLINE-04 | Restored seven-day grace for validated shared API snapshots; stale-grace tests pass. |
| `44b0f314` | QUALITY-03 | Removed four baseline lint errors; lint exits zero with 54 warnings remaining. |
| `9b94a3b4`, `893dd039` | PRIVACY-02 | Replaced production stack/error disclosure with generic recovery UI; focused component test passes. |
| `a2694690` | PRIVACY-01 | Gated hydration DOM tracing to non-production markup; focused hydration audit passes. |

For the offline and privacy fixes, `npm run type-check`, `npm run lint`, and `npm run build` were run after the corresponding changes; all completed successfully except lint retains 54 warnings. A later combined `hydration:regression-audit` command reports 15/15 hydration checks but its chained render-regression phase fails on existing missing `content-visibility` styles in `ServiceProviderCard.tsx`.

## 4. Architecture Findings and Refactoring Plan

### App Router / rendering

- There are 71 `page.tsx` route modules. The root layout is a Server Component, but it reads `cookies()` and `headers()` at `app/layout.tsx:190-193`; this makes the subtree request-rendered and should be retained only if the CSP nonce cannot be issued safely by another design.
- Route segment configuration is sparse: four browse pages explicitly use `force-dynamic`, the sitemap is `force-dynamic` with an ineffective six-hour `revalidate`, and three icon routes are `force-static`. No `generateStaticParams` declarations were found in page modules; dynamic detail routes are consequently runtime-rendered.
- There are 26 loading/error/not-found boundary modules, including a non-empty root fallback. `NavigationProgress` correctly wraps `useSearchParams()` in `Suspense` (`components/shared/NavigationProgress.tsx:10-17`) and cleans timers/listeners on unmount (`:117-126,137-140`).
- Root providers add a large client-side runtime surface: Query, auth/theme, SW/offline bootstrap, analytics/consent, presence, notifications, and global shortcuts are mounted in `providers/AppProviders.tsx:184-247`. Keep true app-wide services there; page/feature-only services should be moved nearer their route.
- Only six pages define `generateMetadata`; zero pages define `generateStaticParams`. Metadata on dynamic details is fetched server-side, while several list/detail routes still rely on client-rendered content. Review canonical/robots and no-data metadata per route before making routes static.
- The build reports shared First Load JS of 105 kB; sample route First Load JS is `/admin` 340 kB, `/offline` 280 kB, `/stores/[id]` 323 kB, and `/products/[id]` 299 kB (`audit/baseline.md`). Heavy detail forms and admin/offline hubs are refactor candidates; keep `next/dynamic` for genuinely optional maps/native integrations rather than splitting every component.

### State, queries, and lifecycle

- `queryKeys.ts` centralizes query keys and typed query parameter shapes; key factories cover the main domains. Query defaults are `staleTime=90s`, `gcTime=600s`, custom bounded retry, `refetchOnWindowFocus=false`, custom freshness-aware `refetchOnMount`, and `networkMode: 'offlineFirst'` (`lib/queryClient.ts:50-75`). Reconnect behavior is TanStack's default (`true`); there is no `networkMode: 'always'`.
- Mutations use `retry: 0` and do not override `networkMode` (`lib/queryClient.ts:73-75`), so TanStack's default applies. Offline mutation replay is handled separately by the SW queue, not by paused TanStack mutations.
- Safe public query snapshots are persisted in IndexedDB; the allowlist rejects private/search/location-shaped keys and enforces entry/age/byte budgets (`lib/offlineQueryCache.ts`). Logout cleanup and stale/invalid record cleanup are present. These contracts need focused integration tests after the existing failures are understood.
- `AppProviders` cancels its event listener and unsubscription, and the offline bootstrap clears intervals/listeners. Root timer/listener cleanup was present in reviewed code; no blanket memory-leak claim is made.
- There is no E2E assertion of optimistic-mutation rollback or reconnect-driven query refetch. Add these only with deterministic API fixtures.

### Code quality, UX, and accessibility

- Strict TypeScript is on. The 6 unsafe `as any` locations and one `@ts-ignore` are listed in `audit/type-escape-hatches.txt`; avoid widening these during refactors.
- Arabic literals are found in 680 source files by Unicode scan. The scan includes comments and is a candidate list, not proof that every match is rendered UI. The app declares Arabic/RTL (`app/layout.tsx:197`); no locale-switching framework was found, so i18n switching is N/A rather than a failing behavior.
- Radix dialog primitives are present and components contain ARIA dialog patterns, but there is no automated axe scan and modal focus-trap/return behavior is not verified end-to-end.
- Keyboard/form tests cover login and search paths, but do not establish keyboard behavior for every dropdown, modal, and CRUD flow.
- No user-facing hardcoded-string localization layer is evident. Treat the candidate Arabic literal inventory as technical debt if a second locale is added.
- The component-size inventory is in `audit/large-components.txt`. Extract feature-oriented hooks/components only alongside tests; the largest files are listed above.

## 5. Before/After Metrics

| Metric | Baseline | After |
|---|---:|---:|
| Type-check | PASS | PASS |
| Lint | 4 errors / 54 warnings | 0 errors / 54 warnings |
| Unit tests | 4,140 pass / 92 fail / 11 skipped | Focused: 16/16 offline tests + 1/1 boundary test pass; complete suite unresolved (last complete pre-migration run: 89 failed / 4,144 passed / 11 skipped; later run interrupted) |
| Production build | PASS; 71 pages; shared First Load JS 105 kB | PASS; 71 pages; shared First Load JS 105 kB |
| Offline cache truth audit | Not recorded at baseline | 30/30 checks pass |
| Chromium E2E | Browser launch initially blocked; later installed host libraries | 20/20 smoke tests pass (`marketplace-smoke` + `route-query-and-not-found`, Chromium) |
| Lighthouse | Not measured; Lighthouse package was not installed at baseline | Not measured |
| Example route First Load JS | `/admin` 340 kB; `/offline` 280 kB; `/stores/[id]` 323 kB | Unchanged |

## 6. Appendix

- Full `"use client"` filename inventory (584 files): [`use-client-files.txt`](use-client-files.txt).
- Arabic Unicode candidate files (680 files; comments may be included): [`arabic-literal-files.txt`](arabic-literal-files.txt).
- Strict-type escape-hatch locations: [`type-escape-hatches.txt`](type-escape-hatches.txt).
- All >300-line TS/TSX source files: [`large-components.txt`](large-components.txt).
- The complete 71-route source inventory is in the build baseline and `apps/web/app/`; only 13 public routes plus auth guards, root, 404 and query handling were exercised in the 20-test Chromium smoke run (see `audit/e2e-report.md`).
- There are two existing conditional `test.skip()` calls for service-worker control readiness; no `test.only`, `waitForTimeout`, visual snapshots, axe tests, or LCP assertion were found.
