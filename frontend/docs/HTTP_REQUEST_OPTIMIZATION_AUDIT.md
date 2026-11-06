# MarketPlat — HTTP Request Optimization Inventory

> Static source inventory generated from the frontend tree. It does not simulate a browser session or contact the production API. Snapshot date: 2026-11-06.

## Current request architecture

- `frontend/api/client.ts` is the primary Axios client. GET calls without a caller-provided `AbortSignal` are coalesced in-flight using a key containing the active user, session-cleanup version, URL, stable query params, and response type. Calls with a signal and binary downloads bypass that shared promise to preserve independent cancellation semantics.
- The same client attaches session/CSRF context, cancels requests at session boundaries, performs a single shared refresh flow, and automatically retries only safe HTTP methods after network/transient HTTP failures. Mutation requests are deliberately excluded because a timeout does not prove that the server did not commit a write.
- `frontend/lib/queryClient.ts` owns the browser QueryClient lifecycle and sets per-domain cache defaults. The global fallback is 90 seconds stale time and 10 minutes garbage collection; focus refetch is disabled, mount refetch checks staleness, and query retries are bounded by the normalized error policy.
- Server reads in `frontend/lib/server/serverApiFetch.ts` use request-scoped React cache deduplication and explicit public/no-store caching policy. Ad detail reads use request-scope deduplication because the endpoint also records views.
- `frontend/lib/networkRequestMonitor.ts` records browser fetch + XHR metadata with source route, duration, status, validated request ID, numeric `Content-Length` when exposed, and an allow-listed `X-Cache` status. It retains at most 300 rows, redacts query values, records only exact concurrent safe-read duplicate flags (the compared full URL stays in memory), and never stores request/response bodies or auth material.

## Static query inventory

| Measure | Result |
| --- | ---: |
| Query-function declarations found | 154 |
| Source files containing queries | 61 |
| Query functions accepting TanStack `AbortSignal` | 154 (100.0%) |
| Query functions without a signal parameter | 0 (0.0%) |
| Query functions missing transport cancellation forwarding (phase-2 audit) | 0 (0.0%) |

The query-key guardrail separately verifies that 144 query hook/queryOptions declarations use the centralized `queryKeys` factory in this snapshot (run `npm run query-keys:audit`). The counts above cover query functions in hooks, components, and app source, so the scopes are not identical.

### Query sources requiring AbortSignal review

The phase-2 cancellation audit now verifies that every discovered query function both accepts TanStack AbortSignal and forwards it in a request config object. The remaining count is zero. Short immutable reference-data reads still benefit from safe cancellation on route changes, while cache freshness remains governed by each query's existing staleTime.

| Source file | Query functions | Signal-aware | Review candidates |
| --- | ---: | ---: | ---: |
| No query functions are missing AbortSignal forwarding | 0 | 0 | 0 |

## Phase 2 — Query cancellation propagation

- All 154 discovered query functions accept TanStack Query's AbortSignal and forward it to the underlying Axios request or native fetch call. The dedicated AST guard checks the transport-config object, not only the parameter name.
- API read wrappers accept an optional request config without changing existing call sites or positional parameters.
- Query-function catch blocks preserve cancellation before offline fallback: the audit checks that each catch rethrows when its AbortSignal is aborted or uses the shared cancellation helper. This prevents obsolete reads from being converted into successful stale offline-cache results.
- The shared Axios client bypasses its global GET in-flight promise map when a caller supplies a signal. TanStack Query remains responsible for same-query deduplication; this prevents one observer's cancellation from aborting another observer's shared transport request.
- The phase-2 audit script is registered as the network:query-abort-audit npm script; runtime helper regression tests live in __tests__/unit/lib/queryCancellation.test.ts.

## Verification results

- Query AbortSignal propagation and query-function catch cancellation guards: 154/154 query functions pass the AST audit; 29 queryFn catch blocks were inspected and all preserve cancellation.
- Query key centralization: 144 query hook/queryOptions declarations, 251 factory-derived cache operations, and 28 API-bound contracts pass their guardrails.
- Request telemetry (before phase 3): 15/15; phase 3 monitor checks cover payload-size safety and per-route rollups (20/20); the phase-3 inventory audit passes 12/12. GET deduplication/concurrency: 9/9 pass. Fetch-client CSRF/retry guardrails: 13/13 pass. Package-script references: 110/110 resolve after adding the phase-3 audit.
- A syntax-only TypeScript AST scan covered 1,653 frontend TS/TSX/JS/JSX files with zero parse diagnostics. This is not a semantic TypeScript type-check or a production build.

## Phase 3 — Runtime payload and page measurement

- The local request monitor now records `Content-Length` as a validated non-negative safe integer for Fetch and XHR, when the browser exposes that header. It does not clone/read response bodies, so monitoring does not add an additional body read or buffer copy.
- Only `X-Cache` values `HIT`, `MISS`, `STALE`, and `BYPASS` are retained. No arbitrary response headers are persisted.
- The monitor compares exact GET/HEAD/OPTIONS URLs while requests are in flight, scoped to the source page. Per-request tickets make cleanup idempotent, so a repeated release cannot decrement another identical request. It persists only a boolean on the later overlapping request; raw query values remain in memory for the comparison and are never written to the journal. POST/PUT/PATCH/DELETE are excluded. The panel reports this as a concurrent exact-read candidate, not as proof of a business-level duplicate.
- The admin panel now groups the sample by source page and shows request count, failures, cancellations, concurrent exact-read candidates, average latency, known response bytes, and the number of responses with readable Content-Length. Missing sizes remain explicitly unknown.
- The size total is an observable Content-Length sum, not a guaranteed wire-transfer total. It may be unavailable for CORS responses, chunked/streamed responses, cached responses, and other cases; use browser DevTools Transfer Size for authoritative transfer measurements.
- `apiClient.batchGet()` remains an explicit opt-in transport capped at eight allow-listed relative GETs. The static scan found zero application callsites. The public homepage already chooses one aggregate `/home/static` or `/home/feed` read, and the store storefront mounts only the selected tab. No additional batch call was introduced without a measured page trace.
- The API batch handler dispatches each allow-listed subrequest through the normal router middleware in parallel. It is not a free optimization: it adds an envelope, executes child route work concurrently, and each child has an 800ms timeout. Compare the aggregate envelope bytes and backend concurrency before adopting it.
- The PWA push-subscription path remains the active legacy `fetchClient` caller. It retries network/5xx failures only for safe HTTP methods; it never automatically replays a POST/PUT/PATCH/DELETE after an ambiguous transport failure. The explicit 401 → shared refresh → replay path remains intact.

## Before/after interpretation

| Scenario | Before this change | After this change |
| --- | --- | --- |
| `fetchClient` POST/PUT/PATCH/DELETE after network or 5xx failure | Up to 3 attempts (up to 2 automatic replays) | 1 attempt; no automatic network replay |
| `fetchClient` safe GET/HEAD/OPTIONS after network or 5xx failure | Up to 3 attempts | Up to 3 attempts, with exponential backoff |
| Safe request aborted during retry backoff | Backoff timer could continue before the next attempt observed the abort | Backoff is cancelled immediately by the caller's signal |
| Normal successful request count | Not changed by this patch | Not changed by this patch |

The cancellation phase does not reduce the number of requests required by an initial page render. It cancels obsolete in-flight reads after a query becomes inactive or its key changes, preventing unnecessary transfer and client processing; actual server-side work saved depends on whether the upstream request/database operation stops after disconnect. A numeric per-page reduction in requests, payload bytes, or backend queries cannot be established from a static ZIP. Those require a controlled before/after browser run against the same build, account state, data set, network profile, and backend. Do not treat cancellation coverage or the mutation retry reduction as a measured page-load request-count reduction.

## Runtime measurement procedure

1. Deploy this frontend build and open the admin Monitoring Center → Network Requests. Clear the local request journal before each scenario.
2. Capture the same journeys separately: guest home, signed-in home, search, ad detail, product detail, service detail, store storefront (products tab), store ads/reviews tabs, account, sales, messaging, and admin.
3. For each journey, capture a cold run and a warm run with the same account, route inputs, dataset, browser, viewport, and network profile. Avoid mixing first-load and post-navigation traffic in one sample.
4. Export the JSON journal. Record request count, failures, cancellations, concurrent exact-read candidates, average/P50/P95/P99 duration, Content-Length coverage, and known response-byte sum. Use DevTools Network to record Transfer Size and cache source for assets/requests whose Content-Length is missing.
5. Only after obtaining repeated traces, identify endpoints that are always co-issued and independently required. For each candidate, compare separate calls versus one `/batch` envelope for total bytes, p95, server concurrency, error isolation, authorization, and cache policy. Do not batch mutations, streams, admin-only data through an under-scoped route, or sections not visible to the user.
6. Profile matching API endpoints using server request IDs and Prisma query metrics before changing response shape or database access. Fix proven oversized projections/N+1 patterns; do not infer them from the number of frontend hooks.

## Scope limitations

This report combines static source review with instrumented local request metadata. No production credentials or authenticated browser session were available in the uploaded archive, so it does not claim live page measurements or numeric before/after reductions. Dependencies were not installed in the extracted project; full Vitest, semantic TypeScript type-check, production build, and live network/DB profiling must run in the project's normal environment.

## Phase 4 — Backend payload projection and authorization query reduction

- The public `GET /stores` directory and homepage featured-store list now use an explicit Prisma `select` (`storeDirectorySelect`) instead of `sellerProfile: true` and the full `StoreType` relation. The response contains only the directory card fields: seven store fields, four seller summary fields (`id`, `verified`, `averageRating`, `totalRatings`), and six store-type presentation fields (`id`, `slug`, `nameAr`, `icon`, `labels`, `presentation`). It omits unused store description/contact/address/hours/coordinates, the seller's unrelated profile/payment/moderation/analytics fields, and dynamic `StoreType.fields` definitions.
- The frontend public directory contract is now `StoreDirectoryItem` and is used by `/stores`, its paginated query/offline snapshot, and homepage store slices. Full `StoreWithSeller` / `StoreWithSellerAndCounts` contracts remain in detail, favorites, followed-store, and admin-oriented paths where those richer fields are still needed.
- The Redis SWR cache key for store directory and featured-store responses now includes `__projectionVersion: 2`. This prevents an older cached response with the previous wider projection from satisfying the new response shape after deployment. Existing namespace-level invalidation behavior remains unchanged.
- `requireStoreAccessForProducts` now loads candidate stores and owner-suspension flags with one bounded Prisma `findMany` (`id IN (...)`) and checks candidates in the original oldest-membership order. It deduplicates store IDs, skips empty batches without querying, and preserves blocked-store / suspended-owner behavior. This removes the prior per-candidate store read plus seller-profile read pattern.
- The general `requireStoreAccess` gate now reads the store together with the owning seller's `id`, `userId`, and `suspended` fields. Owner identification and suspension checks reuse that joined row rather than issuing separate seller-profile queries. ID and slug lookup paths use the same authorization projection; membership lookup and role capability checks remain unchanged.
- Regression coverage was added for the exact public projection, cache-key version, empty and non-empty staff batches, original membership precedence, owner/member access, blocked/suspended behavior, and public API response types.
- No new HTTP batch endpoint or `batchGet` callsite was added. Existing homepage aggregation and active-tab store loading remain in place; there was no static evidence that another batch would reduce useful page requests without fetching unnecessary data.

### Phase 4 verification

- The dedicated backend source audit passes 13/13 checks (`npm run audit:http-payload-phase4` from `apps/api`, or `pnpm audit:http-payload-phase4` from the repository root).
- Existing phase-3 request-monitor tests pass their static audit: 20/20. Phase-3 inventory: 12/12. Concurrent-read dedupe: 9/9. Fetch-client/CSRF retry guardrails: 13/13.
- Query cancellation guards remain 154/154; the phase-12 and phase-13 focused audits pass 10/10 and 22/22. Package script references pass 110/110.
- A TypeScript compiler parser pass covered 2,537 frontend and API TS/TSX/JS/JSX/MJS/CJS source files with zero syntax diagnostics. This is a syntax parse only, not semantic type-checking.
- No production Redis, browser, or Postgres session was available. Therefore actual transferred-byte savings and live query-count reductions were not measured. The projection and SQL round-trip changes are verified from source and regression tests, but Vitest/Jest, semantic type-check, and production build still need to be run in the dependency-installed workspace.

## Phase 5 — Prisma query telemetry and database write batching

- `apps/api/src/shared/utils/dbQueryTelemetry.ts` adds request-scoped Prisma operation counts and duration using `AsyncLocalStorage`, then finalizes aggregates from the existing Express HTTP metrics finish hook. New metrics include global operation count/duration by model/action, Prisma operation count and summed operation time per HTTP route, max repeated read-shape count, repeated-shape candidate groups, and slow operation counts (>=250ms).
- Telemetry is enabled by default outside tests and can be emergency-disabled with `DB_QUERY_METRICS_ENABLED=0`. It is fail-open. It does not log SQL text or parameter values; read arguments are reduced to bounded structural shapes, hashed in memory, and never exposed as metric labels. Per-request tracking is capped at 256 signatures, each shape is capped at 512 nodes, depth 5, and 40 object keys per level. Writes and opaque `$queryRaw` actions are excluded from repeated-read N+1 heuristics but remain counted and timed.
- These are Prisma client-operation metrics, not a guaranteed count of PostgreSQL SQL statements. One Prisma operation may execute multiple SQL statements (e.g. nested relation work), and observed duration includes application-side Prisma engine/connection overhead as well as database round-trip. The repeated-shape metric is only a heuristic candidate, not proof of N+1. Use PostgreSQL `pg_stat_statements` and staging `EXPLAIN (ANALYZE, BUFFERS)` for SQL-level profiling.
- Service-request expiry previously executed up to 200 conditional per-row updates for a full batch. It now performs one parameterized `UPDATE ... RETURNING` for the batch and only notifies IDs actually returned. The conditional `status = PENDING` predicate preserves races with accept/reject/cancel operations; `respondedAt` remains unchanged to preserve system-expiry semantics. This is a 99.5% reduction in expiry UPDATE operations for a full 200-row batch, not a reduction in all statements or notifications.
- `ServiceRequest` already has `@@index([status, createdAt])`; no duplicate index was introduced without database execution plans.

### Phase 5 verification

- Prisma telemetry + expiry static audit: 16/16.
- Store payload/authorization audit: 13/13.
- Phase-3 inventory audit: 12/12; network monitor: 20/20; request deduplication: 9/9.
- Query cancellation phase 12: 10/10; phase 13: 22/22; fetch client/CSRF/retry: 13/13.
- Package script references: 110/110.
- API TypeScript source/test/script syntax scan: 731 files, zero parse diagnostics. Strict type-check passed only for the telemetry module and metrics registry with external-type stubs; it is not a full project type-check.
- Jest/Vitest, full semantic TypeScript check, production build, live PostgreSQL profiling, and runtime before/after measurements were not run because project dependencies and a live database/browser session were not present in the archive.
