# Render Performance — Phases 5–6

## Phase 5 — Query invalidation and cache notification pressure

### Changes
- Removed redundant `invalidateQueries()` calls where a parent prefix already invalidates the same detail cache.
- Applied this to ad, product, service-listing, customer, sales, request and republish-ad mutations where the redundant detail invalidation was provably subsumed by the same `*.all()` prefix.
- Kept invalidations across different cache roots intact (for example follows + user/store detail), because those keys are not subsumed by one another.

### Why
TanStack Query prefix matching means `['products']` already matches `['products','detail',id]`. Calling both creates an additional cache-notification/invalidation operation without expanding the affected cache set. Removing the duplicate reduces mutation-side cache churn while preserving the same stale coverage.

## Phase 6 — Safe offscreen rendering optimization and virtualization guard

A true DOM virtualizer was deliberately NOT introduced. The project's cards/messages have variable content and responsive geometry, and no virtualization dependency exists in the current lockfile. Adding a fixed-height virtualizer without runtime profiling would risk scroll jumps, incorrect measurement and broken message anchoring.

Instead, high-frequency card/message roots now use browser-native `content-visibility:auto`. This lets the browser skip rendering work for far-offscreen subtrees while preserving their DOM ownership and variable-height layout.

This is a safe intermediate optimization. Full DOM virtualization remains a measured follow-up once React Profiler/runtime traces establish stable row geometry and a suitable virtualization strategy.
