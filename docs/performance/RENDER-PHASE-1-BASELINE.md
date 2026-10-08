# Render Performance Audit — Phase 1 Baseline

## Scope

This baseline covers the frontend rendering architecture before the Phase 2 connectivity refactor. It is intentionally source-based and reproducible; it does **not** claim that a static count equals a runtime render count.

Run from `frontend/`:

```bash
npm run perf:render-audit
```

Runtime render counts must be confirmed separately with React DevTools Profiler against representative flows.

## Baseline findings

The original ZIP was measured before modification using production frontend source only (tests/scripts excluded):

| Metric | Before Phase 2 | After Phase 2 |
|---|---:|---:|
| Files containing `useOnlineStatus` | 35 | 40 |
| `useOnlineStatus(...)` references | 51 | 57 |
| Raw `online`/`offline` DOM listener registrations | 24 | 14 |
| Files using `CardOfflineBadge` | 6 | 6 |
| Files using `useNowAfterMount` | 4 | 4 |
| `React.memo` occurrences | 0 | 0 |

The important architectural reduction is **10 raw browser listener registrations removed from the state-based connectivity paths**. The remaining 14 are intentional event-driven integrations (service worker/queue/presence/PWA/offline-hub behavior) plus the singleton listener pair owned by `useOnlineStatus`.

The audit found:

- `useOnlineStatus` is consumed across a broad portion of the frontend.
- Before Phase 2, each hook instance owned its own `online`/`offline` browser listeners.
- `CardOfflineBadge` independently subscribed to the same browser events, creating a second subscription path inside card lists.
- Several page components duplicated the same local online state pattern instead of using the shared hook.
- `useNowAfterMount` is used by multiple card types and remains a Phase 3/4 target because it creates a post-mount state transition per card.
- There were no `React.memo` occurrences in the frontend source at baseline. This is deliberately **not** changed in Phase 1/2 because memoization should follow profiling and stable-prop boundaries rather than be applied globally.

## Phase 1 measurement contract

For every subsequent rendering optimization, record:

1. The user flow being profiled.
2. Component render count before the change.
3. Component render count after the change.
4. Commit duration before/after.
5. Number of mounted list items during the test.
6. Whether a state/query/context change was expected to affect the component.
7. Any behavioral regression discovered by tests or manual verification.

Recommended flows:

- Home feed with a populated card grid.
- Search results with filters changing.
- Favorites list while toggling one favorite.
- Store/product/service grids.
- Conversation with multiple messages.
- Online → offline → online transition while a card grid is mounted.

## Phase 2 acceptance criteria

The connectivity refactor is considered complete when:

- All `useOnlineStatus()` consumers share one underlying browser listener pair while at least one consumer is mounted.
- The last consumer unmounting removes the two underlying listeners.
- `online` and `offline` events update all mounted consumers.
- SSR/hydration keeps the existing optimistic initial snapshot contract.
- Card offline badges use the shared connectivity source rather than their own DOM listeners.
- Existing tests continue to pass.
- No query/mutation behavior is changed by the refactor.

## Explicit non-goals

Phase 1/2 does not introduce:

- blanket `React.memo` across the application,
- broad `useMemo`/`useCallback` additions,
- query invalidation rewrites,
- list virtualization,
- ChatWindow decomposition,
- changes to offline business logic or service-worker event handlers.

Those belong to later rendering/performance phases and should be driven by profiler evidence.
