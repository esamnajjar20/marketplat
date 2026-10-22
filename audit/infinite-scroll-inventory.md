# Infinite scroll and pagination inventory

Discovery run against `frontend/` on 2026-10-22. The primary matches are
`useInfiniteQuery`, `IntersectionObserver`, `react-intersection-observer`,
the shared `InfiniteScrollTrigger`, `fetchNextPage`, and cursor pagination
coupled to scroll listeners. No `react-intersection-observer` package usage
was found.

## Infinite-query lists and routes

| Source file | Route(s) | Current behavior |
|---|---|---|
| `frontend/components/stores/ProductsGrid.tsx` | `/products` | Infinite product query; `InfiniteScrollTrigger` |
| `frontend/components/stores/StoresGrid.tsx` | `/stores` | Infinite store query; `InfiniteScrollTrigger` |
| `frontend/components/services/ServiceListingsGrid.tsx` | `/services` | Infinite service query; `InfiniteScrollTrigger` |
| `frontend/components/promoted/PromotedPageClient.tsx` | `/promoted` | Infinite promoted-products query; `InfiniteScrollTrigger` |
| `frontend/components/search/SearchResults.tsx` | `/search` | Infinite unified-results query; `InfiniteScrollTrigger` |
| `frontend/components/ads/SearchResults.tsx` | `/ads`, `/categories/[slug]` | Infinite ads query; `InfiniteScrollTrigger` |
| `frontend/components/shared/list/InfiniteScrollTrigger.tsx` | All six routes above | Shared `IntersectionObserver` trigger for fetching the next page |

## Other intersection observers

| Source file | Route(s) | Behavior |
|---|---|---|
| `frontend/components/shared/LazySection.tsx` | `/` (home sections) | Defers rendering below-the-fold sections; not pagination |

`IntersectionObserver` also appears in `frontend/__tests__/components/LazySection.test.tsx`
and in source inventory tooling (`frontend/scripts/query-key-audit.cjs` mentions
`useInfiniteQuery` as a recognized query hook). These are not page pagination
implementations.

## Scroll-driven message history and related scroll listeners

| Source file | Route(s) | Behavior |
|---|---|---|
| `frontend/components/messages/ChatWindow.tsx` | `/messages/[id]` | Older messages use cursor pagination with an explicit “load older” action; scroll listener maintains near-bottom/jump-to-latest state and restores scroll anchoring, but does not trigger pagination |
| `frontend/components/home/HomeScrollRail.tsx` | `/` | Horizontal rail position; not pagination |
| `frontend/components/home/FeaturedCarousel.tsx` | `/` | Carousel scroll/swipe controls; not pagination |
| `frontend/components/shared/ui/ScrollToTop.tsx` | Shared layout | Scroll position visibility; not pagination |
| `frontend/hooks/useScrollRestore.ts` | Shared navigation | Persists/restores window scroll; not pagination |
| `frontend/hooks/useScrollDirection.ts` | Shared layout/navigation | Header direction state; not pagination |
| `frontend/hooks/useVisualViewportHeight.ts` | Shared layout/forms | Viewport sizing; not pagination |
| `frontend/components/shared/FloatingDebugConsole.tsx` | Debug UI | Scrolls console output to bottom; not pagination |
| `frontend/components/debug/AdminScriptConsole.tsx` | Admin debug UI | Scrolls console output to bottom; not pagination |

Scroll-event references in forms, tabs, and offline UI only call
`window.scrollTo` to position the viewport and do not paginate content.

## Existing tests

- `frontend/__tests__/components/ProductsGrid.test.tsx`
- `frontend/__tests__/components/StoresGrid.test.tsx`
- `frontend/__tests__/components/ServiceListingsGrid.test.tsx`
- `frontend/__tests__/components/SearchResults.test.tsx`
- `frontend/__tests__/components/search/SearchResults.test.tsx`
- `frontend/__tests__/components/LazySection.test.tsx`
- `frontend/__tests__/components/ChatWindow.test.tsx`
