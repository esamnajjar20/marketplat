# Infinite scroll and pagination inventory

Discovery run against `apps/web/` on 2026-10-22. The primary matches are
`useInfiniteQuery`, `IntersectionObserver`, `react-intersection-observer`,
the shared `InfiniteScrollTrigger`, `fetchNextPage`, and cursor pagination
coupled to scroll listeners. No `react-intersection-observer` package usage
was found.

## Infinite-query lists and routes

| Source file | Route(s) | Current behavior |
|---|---|---|
| `apps/web/components/stores/ProductsGrid.tsx` | `/products` | Infinite product query; `InfiniteScrollTrigger` |
| `apps/web/components/stores/StoresGrid.tsx` | `/stores` | Infinite store query; `InfiniteScrollTrigger` |
| `apps/web/components/services/ServiceListingsGrid.tsx` | `/services` | Infinite service query; `InfiniteScrollTrigger` |
| `apps/web/components/promoted/PromotedPageClient.tsx` | `/promoted` | Infinite promoted-products query; `InfiniteScrollTrigger` |
| `apps/web/components/search/SearchResults.tsx` | `/search` | Infinite unified-results query; `InfiniteScrollTrigger` |
| `apps/web/components/ads/SearchResults.tsx` | `/ads`, `/categories/[slug]` | Infinite ads query; `InfiniteScrollTrigger` |
| `apps/web/components/shared/list/InfiniteScrollTrigger.tsx` | All six routes above | Shared `IntersectionObserver` trigger for fetching the next page |

## Migration status

| Route | Status | First Load JS | Notes |
|---|---|---:|---|
| `/promoted` | Converted | 230 → 229 kB | Server-rendered initial results with explicit Load More. |
| `/products` | Deferred | 119 → 248 kB (experiment reverted) | Dependency/client-graph bloat; the server experiment imported the heavy product-card client graph. Keep existing pagination until server and Load More requests use lightweight native fetch rather than `apiClient`. |
| `/stores` | Deferred | 116 → 231 kB (experiment reverted) | Dependency/client-graph bloat; the server experiment imported the store-card client graph. Keep existing pagination until server and Load More requests use lightweight native fetch rather than `apiClient`. |
| `/services` | Deferred | 107 → 245 kB (experiment reverted) | Native-fetch server first page and explicit Load More compiled, but rendering the service-card client graph raised First Load JS by 129.0%. See `audit/rsc-report.md`. |
| `/search` | Deferred | 107 → 269 kB (experiment reverted) | Native-fetch server first page and explicit Load More compiled, but rendering the unified-search client graph raised First Load JS by 151.4%. See `audit/rsc-report.md`. |
| `/ads`, `/categories/[slug]` | Pending | — | Refactor server first-page and client Load More requests to native `fetch`; preserve category-slug resolution. |

## Other intersection observers

| Source file | Route(s) | Behavior |
|---|---|---|
| `apps/web/components/shared/LazySection.tsx` | `/` (home sections) | Defers rendering below-the-fold sections; not pagination |

`IntersectionObserver` also appears in `apps/web/__tests__/components/LazySection.test.tsx`
and in source inventory tooling (`apps/web/scripts/query-key-audit.cjs` mentions
`useInfiniteQuery` as a recognized query hook). These are not page pagination
implementations.

## Scroll-driven message history and related scroll listeners

| Source file | Route(s) | Behavior |
|---|---|---|
| `apps/web/components/messages/ChatWindow.tsx` | `/messages/[id]` | Older messages use cursor pagination with an explicit “load older” action; scroll listener maintains near-bottom/jump-to-latest state and restores scroll anchoring, but does not trigger pagination |
| `apps/web/components/home/HomeScrollRail.tsx` | `/` | Horizontal rail position; not pagination |
| `apps/web/components/home/FeaturedCarousel.tsx` | `/` | Carousel scroll/swipe controls; not pagination |
| `apps/web/components/shared/ui/ScrollToTop.tsx` | Shared layout | Scroll position visibility; not pagination |
| `apps/web/hooks/useScrollRestore.ts` | Shared navigation | Persists/restores window scroll; not pagination |
| `apps/web/hooks/useScrollDirection.ts` | Shared layout/navigation | Header direction state; not pagination |
| `apps/web/hooks/useVisualViewportHeight.ts` | Shared layout/forms | Viewport sizing; not pagination |
| `apps/web/components/shared/FloatingDebugConsole.tsx` | Debug UI | Scrolls console output to bottom; not pagination |
| `apps/web/components/debug/AdminScriptConsole.tsx` | Admin debug UI | Scrolls console output to bottom; not pagination |

Scroll-event references in forms, tabs, and offline UI only call
`window.scrollTo` to position the viewport and do not paginate content.

## Existing tests

- `apps/web/__tests__/components/ProductsGrid.test.tsx`
- `apps/web/__tests__/components/StoresGrid.test.tsx`
- `apps/web/__tests__/components/ServiceListingsGrid.test.tsx`
- `apps/web/__tests__/components/SearchResults.test.tsx`
- `apps/web/__tests__/components/search/SearchResults.test.tsx`
- `apps/web/__tests__/components/LazySection.test.tsx`
- `apps/web/__tests__/components/ChatWindow.test.tsx`
