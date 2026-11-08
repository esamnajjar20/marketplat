# MarketPlat — HTTP Request Optimization Inventory

> Static source inventory generated from the frontend tree. It does not simulate a browser session or contact the production API. Snapshot date: 2026-11-08.

## Current request architecture

- `frontend/api/client.ts` is the primary Axios client. GET calls without a caller-provided `AbortSignal` are coalesced in-flight using a key containing the active user, session-cleanup version, URL, stable query params, and response type. Calls with a signal and binary downloads bypass that shared promise to preserve independent cancellation semantics.
- The same client attaches session/CSRF context, cancels requests at session boundaries, performs a single shared refresh flow, and automatically retries only safe HTTP methods after network/transient HTTP failures. Mutation requests are deliberately excluded because a timeout does not prove that the server did not commit a write.
- `frontend/lib/queryClient.ts` owns the browser QueryClient lifecycle and sets per-domain cache defaults. The global fallback is 90 seconds stale time and 10 minutes garbage collection; focus refetch is disabled, mount refetch checks staleness, and query retries are bounded by the normalized error policy.
- Server reads in `frontend/lib/server/serverApiFetch.ts` use request-scoped React cache deduplication and explicit public/no-store caching policy. Ad detail reads use request-scope deduplication because the endpoint also records views.
- `frontend/lib/networkRequestMonitor.ts` records browser fetch + XHR metadata with source route, duration, status, validated request ID, numeric `Content-Length` when exposed, and an allow-listed `X-Cache` status. It retains at most 300 rows, redacts query values, records only exact concurrent safe-read duplicate flags (the compared full URL stays in memory), and never stores request/response bodies or auth material.

## Static query inventory

| Measure | Result |
| --- | ---: |
| Query-function declarations found | 155 |
| Source files containing queries | 61 |
| Query functions accepting TanStack `AbortSignal` | 155 (100.0%) |
| Query functions without a signal parameter | 0 (0.0%) |
| Query functions missing transport cancellation forwarding (phase-2 audit) | 0 (0.0%) |

The query-key guardrail separately verifies that 144 query hook/queryOptions declarations use the centralized `queryKeys` factory in this snapshot (run `npm run query-keys:audit`). The counts above cover query functions in hooks, components, and app source, so the scopes are not identical.

### Query declarations by source file

This table maps the declarative read-query layer to its owning source file. The endpoint implementation is shown separately in the generated callsite CSV, because query functions normally call API wrapper methods rather than constructing raw URLs.

| Source file | Query functions | Signal-aware | Missing signal |
| --- | ---: | ---: | ---: |
| `components/ads/AdCategoryChips.tsx` | 1 | 1 | 0 |
| `components/ads/SearchResults.tsx` | 1 | 1 | 0 |
| `components/promoted/PromotedLoadMore.tsx` | 1 | 1 | 0 |
| `components/sales/ReceiptPageClient.tsx` | 1 | 1 | 0 |
| `components/search/SearchResults.tsx` | 1 | 1 | 0 |
| `components/sellers/SellersRankingList.tsx` | 1 | 1 | 0 |
| `components/services/ServiceCategoryChips.tsx` | 1 | 1 | 0 |
| `components/services/ServiceListingMatches.tsx` | 1 | 1 | 0 |
| `components/services/ServiceListingsGrid.tsx` | 1 | 1 | 0 |
| `components/services/ServiceProviderServiceTypesEditor.tsx` | 2 | 2 | 0 |
| `components/stores/ProductCategoryChips.tsx` | 1 | 1 | 0 |
| `components/stores/ProductsGrid.tsx` | 1 | 1 | 0 |
| `components/stores/PublicSalesStats.tsx` | 1 | 1 | 0 |
| `components/stores/StoreAds.tsx` | 1 | 1 | 0 |
| `components/stores/StoresGrid.tsx` | 1 | 1 | 0 |
| `hooks/queries/useActivity.ts` | 1 | 1 | 0 |
| `hooks/queries/useAdmin.ts` | 20 | 20 | 0 |
| `hooks/queries/useAds.ts` | 7 | 7 | 0 |
| `hooks/queries/useAppointments.ts` | 2 | 2 | 0 |
| `hooks/queries/useAuth.ts` | 2 | 2 | 0 |
| `hooks/queries/useBadges.ts` | 2 | 2 | 0 |
| `hooks/queries/useBlockedUsers.ts` | 2 | 2 | 0 |
| `hooks/queries/useCategories.ts` | 3 | 3 | 0 |
| `hooks/queries/useCollections.ts` | 4 | 4 | 0 |
| `hooks/queries/useConversations.ts` | 5 | 5 | 0 |
| `hooks/queries/useCustomers.ts` | 3 | 3 | 0 |
| `hooks/queries/useDebts.ts` | 1 | 1 | 0 |
| `hooks/queries/useFavoriteLists.ts` | 1 | 1 | 0 |
| `hooks/queries/useFavorites.ts` | 4 | 4 | 0 |
| `hooks/queries/useFollows.ts` | 5 | 5 | 0 |
| `hooks/queries/useHomeFeed.ts` | 1 | 1 | 0 |
| `hooks/queries/useHomepage.ts` | 1 | 1 | 0 |
| `hooks/queries/useMyReports.ts` | 1 | 1 | 0 |
| `hooks/queries/useNotificationDevices.ts` | 1 | 1 | 0 |
| `hooks/queries/useNotifications.ts` | 2 | 2 | 0 |
| `hooks/queries/usePresence.ts` | 1 | 1 | 0 |
| `hooks/queries/useProductCategories.ts` | 3 | 3 | 0 |
| `hooks/queries/useProducts.ts` | 3 | 3 | 0 |
| `hooks/queries/usePromotions.ts` | 2 | 2 | 0 |
| `hooks/queries/useRecommendations.ts` | 6 | 6 | 0 |
| `hooks/queries/useRequests.ts` | 4 | 4 | 0 |
| `hooks/queries/useSales.ts` | 10 | 10 | 0 |
| `hooks/queries/useSavedSearches.ts` | 1 | 1 | 0 |
| `hooks/queries/useSearch.ts` | 2 | 2 | 0 |
| `hooks/queries/useSearchFacets.ts` | 1 | 1 | 0 |
| `hooks/queries/useSellerRatings.ts` | 1 | 1 | 0 |
| `hooks/queries/useSellers.ts` | 3 | 3 | 0 |
| `hooks/queries/useSequentialGeoSearch.ts` | 1 | 1 | 0 |
| `hooks/queries/useServiceCategories.ts` | 3 | 3 | 0 |
| `hooks/queries/useServiceListings.ts` | 3 | 3 | 0 |
| `hooks/queries/useServiceProviders.ts` | 5 | 5 | 0 |
| `hooks/queries/useServiceRequests.ts` | 3 | 3 | 0 |
| `hooks/queries/useServiceReviews.ts` | 1 | 1 | 0 |
| `hooks/queries/useServiceTypes.ts` | 2 | 2 | 0 |
| `hooks/queries/useStockInventory.ts` | 2 | 2 | 0 |
| `hooks/queries/useStoreMembers.ts` | 2 | 2 | 0 |
| `hooks/queries/useStoreReviews.ts` | 1 | 1 | 0 |
| `hooks/queries/useStores.ts` | 5 | 5 | 0 |
| `hooks/queries/useStoreTypes.ts` | 2 | 2 | 0 |
| `hooks/queries/useStories.ts` | 3 | 3 | 0 |
| `hooks/queries/useUsers.ts` | 1 | 1 | 0 |

The companion [HTTP request callsite inventory](./HTTP_REQUEST_CALLSITE_INVENTORY.csv) lists API-client calls, server API reads, native fetch callsites, and TanStack query/mutation declarations with their file and line number. It is a static source map, not a count of requests sent on one page.

### Query sources requiring AbortSignal review

The phase-2 cancellation audit now verifies that every discovered query function both accepts TanStack AbortSignal and forwards it in a request config object. The remaining count is zero. Short immutable reference-data reads still benefit from safe cancellation on route changes, while cache freshness remains governed by each query's existing staleTime.

| Source file | Query functions | Signal-aware | Review candidates |
| --- | ---: | ---: | ---: |
| No query functions are missing AbortSignal forwarding | 0 | 0 | 0 |

## Phase 2 — Query cancellation propagation

- All 155 discovered query functions accept TanStack Query's AbortSignal and forward it to the underlying Axios request or native fetch call. The dedicated AST guard checks the transport-config object, not only the parameter name.
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
