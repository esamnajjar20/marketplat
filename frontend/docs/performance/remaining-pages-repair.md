# Remaining public pages repair

This patch closes the outstanding page-level gaps identified in the final App Router coverage sweep.

## Changes

- `/trending`: server-fetches one public mixed recommendation payload with `no-store`, hydrates the guest-scoped mixed query, and can render the seeded cards before browser city/auth readiness. Personalized `/for-you` and `/suggestions` remain client-fetched because the server has no caller bearer token.
- Recommendation fallbacks: the client makes one mixed request and starts a public list fallback only for entity types whose recommendation array is absent or underfilled after the mixed request settles.
- `/requests`: parses URL filters in the Server Page, prefetches the public first page with the canonical `queryKeys.requests.open(params)` key, and keeps filter navigation and subsequent requests interactive.
- `/search`: prefetches page one for non-GPS searches with `no-store`; GPS searches remain browser-resolved. `SearchResults` is SSR-capable and remains inside Suspense for its URL hook. The initial page size is fixed at 10 so server/client query keys and pagination agree.
- `/categories`: fetches the three category trees independently rather than downloading the full `/home` payload.
- `/profile/[id]`: prefetches only the initial public ads tab under the existing user-ads query key; other tabs stay lazy.
- `/promoted`: renders page one as Server Component cards, hydrates the same infinite-query key, and lets the client island render only later pages (or all pages when the server fetch fails).

## Safety boundaries

- Request-list SSR uses only public `GET /requests`; it does not prefetch `/requests/me`, `/requests/offers/me`, or request-detail offer data.
- Profile SSR uses the public `GET /users/:id/ads` route.
- Recommendation SSR for `/trending` is anonymous and `no-store`; user-specific `/for-you` and `/suggestions` are not serialized into shared cache.
- Search, request filters, and profile ad pages use `no-store` at the Next layer; only taxonomy trees use the existing tagged public Data Cache.

## Validation

Run `npm run perf:remaining-pages-repair-audit` and `npm run perf:final-pages-audit`. These source-contract audits do not replace `npm run type-check`, `npm run build`, Vitest, or browser performance measurements.
