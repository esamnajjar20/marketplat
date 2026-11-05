# Final Next.js performance sweep — remaining public pages

## Scope

This sweep starts from the cumulative Stage 1–5 source tree. It checks remaining App Router routes and common browser lifecycle patterns without converting interactive or identity/location-dependent pages to Server Components indiscriminately.

## Changes applied

### Seller ranking (`/(public)/sellers/ranking`)

- Removed the obsolete `dynamic(..., { ssr: false })` boundary. The prior comment said the offline snapshot was read during the first render, but `useOfflineListSeed` actually reads it in `useEffect` after hydration.
- Prefetched the public `GET /sellers/ranking?limit=30` endpoint in the Server Component and seeded the exact `queryKeys.sellers.ranking(30)` key through `HydrationBoundary`.
- Centralized the ranking query key and shared the public DTO/normalizer between the server and client paths.
- Kept the offline snapshot path. A server-seeded list is persisted after hydration; an old offline snapshot is not re-saved with a fresh timestamp.
- Set a 30-second client `staleTime`, matching the endpoint's short-lived public nature and preventing an immediate duplicate GET after SSR.
- Preserved usable cached rows if a later background refresh fails; the error becomes non-blocking while a valid snapshot remains visible.

### Category landing pages (`/(public)/categories/[slug]`)

- Share `getBySlug` between `generateMetadata` and the route body via `React.cache()`.
- Hydrate the canonical `queryKeys.categories.slug(slug)` key so `CategoryHero`, filters, and result components do not need an immediate second category lookup.
- Fetch the first ad page on the server using the route's current query filters, the same fixed SSR page size, and the same `/ads` versus `/ads/search` endpoint selection as the client query.
- Pass the page to `SearchResults` as `initialPage`; subsequent pages continue using the existing infinite-query API and offline snapshots.
- Category/filter/search combinations remain `no-store` in the Next Data Cache through `fetchPublicBrowsePage`; no high-cardinality filter cache is created.

### Public store statistics (`/(public)/store/[slug]/stats`)

- Prefetches the viewer-independent aggregate stats endpoint in the Server Component.
- Hydrates the exact `queryKeys.publicStoreSalesStats(slug)` query consumed by the client component.
- Encodes the route slug and keeps the endpoint `no-store` in Next.js because this route has no registered Next Data Cache invalidation tag. The backend's existing short cache remains authoritative.
- Sets a 20-second client `staleTime` to avoid an immediate duplicate request.
- Retains the existing client loading/error path if SSR fetch fails.

### Category first-page rendering

- Category route filters are normalized using the same URL parser as `SearchResults`.
- Only the first 10 rows are fetched on the server; pagination continues through the existing infinite query.
- Category/search/city/price/condition combinations remain `no-store`, consistent with the high-cardinality cache policy.
- The category tree, slug lookup, and first ad page now enter hydration under their existing query contracts.

### Audit guardrails

- Updated `render-regression-audit.mjs` to inspect the extracted `useNowAfterMount.ts` clock module rather than its old barrel path.
- Updated the hydration audit to accept the actual root body class ordering while still requiring `notranslate` and `translate="no"`.
- Updated the object URL guard to accept the current equivalent identity check expression.
- Updated upload concurrency checks to assert the current Redis-backed distributed semaphore rather than an obsolete process-local counter.
- Added `perf:final-pages-audit` for the newly covered public routes and their safety boundaries.

## Remaining client boundaries reviewed

These were inspected and intentionally retained rather than changed blindly:

- `/service-providers`: the initial result depends on persisted account city and browser GPS resolution (`useServiceProvidersDirectory` / `useLocationResolver`). Forcing SSR without a deterministic location seed risks a server/client mismatch and could use the wrong city.
- `/search`: URL-bound controls and the unified results client graph remain isolated. The repository's prior RSC experiment measured First Load JS rising from 107 kB to 269 kB (+151.4%) when the full unified-search result graph was rendered; the experiment was reverted. A smaller result/card boundary is needed before another conversion.
- `/requests`: `RequestsPageClient` reads `useSearchParams()` and owns URL-driven infinite pagination; its client boundary is retained until it can receive a fully normalized server query contract without reintroducing the known hydration boundary.
- `/services`: the first page is already fetched in the Server Component and passed to `ServiceListingsGrid`, which is server-rendered with the same `initialPage` before client hydration. Filters and infinite pagination remain client-side. A prior attempt to change the service card/result graph increased First Load JS from 107 kB to 245 kB (+129.0%); do not repeat that broad conversion without splitting the card graph first.
- `/stories`: authenticated, interactive story feed/composer/viewer uses browser media and local active/composer state.
- Edit forms, admin debug tools, offline/update pages, conversations, payment actions, and other mutation-heavy flows remain client-driven where browser APIs, auth state, media, or local interaction are fundamental.

Timer/listener review also found no safe broad rewrite: the shared relative-time clock is one visibility-aware minute scheduler; network lifecycle is shared; presence is gated behind an authenticated island; PWA refresh timers are online/visibility gated; carousel timers pause when the page is hidden/reduced-motion. These mechanisms were preserved.

## Verification

Source-level audits are run from `frontend` with Node. In this final sweep, the dedicated remaining-pages audit passes 20/20; the prior Server Prefetch, Cache, Browse Hydration, Detail Dedup, Performance, RSC/Hydration, render regression, hidden-architecture, Navigation, Offline, and Query Key audits also pass. A global TypeScript parser reports 12/12 changed TS/TSX files syntactically valid. This is not a replacement for `next build`, full TypeScript type-check, Vitest, browser hydration, or Lighthouse. The supplied project copy has no `node_modules`, so those dependency-backed and browser-level checks remain pending.
