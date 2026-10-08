# Render Performance — Phase 1 + Phase 2 Delivery

## What was implemented

### Phase 1 — Baseline and measurement contract

- Added `docs/performance/RENDER-PHASE-1-BASELINE.md`.
- Added `frontend/scripts/render-audit.mjs` and the `perf:render-audit` npm script.
- The audit deliberately measures source architecture, not runtime render counts.
- Defined representative profiler flows and acceptance criteria so later render changes can be measured instead of guessed.

### Phase 2 — Connectivity subscription architecture

Replaced per-component browser connectivity subscriptions with one shared external store behind the existing `useOnlineStatus()` API.

Implementation details:

- Uses React 19 `useSyncExternalStore`.
- Keeps the existing optimistic server/first-render snapshot (`true`).
- Synchronizes to `navigator.onLine` when the first consumer subscribes.
- Installs exactly one `online` listener and one `offline` listener while consumers exist.
- Removes both listeners when the final consumer unmounts.
- Notifies all React consumers from a single in-memory subscriber set.
- Does not change the hook's public API, so existing consumers do not need rewrites.

### Consumers migrated

The following duplicated local connectivity implementations now use `useOnlineStatus()`:

- `components/shared/cards/cardParts.tsx` — `CardOfflineBadge`
- `components/shared/feedback/ListDataStatus.tsx`
- `components/settings/OfflineControlClient.tsx`
- `components/payments/SavedPaymentsPageClient.tsx`
- `components/downloads/DownloadsPageClient.tsx`

This is important for card/list-heavy pages because the old `CardOfflineBadge` path alone could create another `online`/`offline` pair for every mounted card.

## Measured architectural change

Production frontend source, before vs. after:

| Metric | Before | After |
|---|---:|---:|
| Files containing `useOnlineStatus` | 35 | 40 |
| `useOnlineStatus(...)` references | 51 | 57 |
| Raw `online`/`offline` listener registrations | 24 | 14 |
| Files using `CardOfflineBadge` | 6 | 6 |
| Files using `useNowAfterMount` | 4 | 4 |
| `React.memo` occurrences | 0 | 0 |

The reduction from 24 → 14 is not achieved by deleting functionality. Ten state-oriented duplicate listener registrations were removed. The remaining registrations belong to intentional event-driven integrations such as PWA, service-worker/offline queues, presence, and offline hub behavior, plus the two listeners owned by the new singleton connectivity store.

## Tests added

`frontend/__tests__/hooks/useOnlineStatus.test.tsx` verifies:

1. Multiple consumers share one `online` listener and one `offline` listener.
2. The listeners are not removed while at least one consumer remains mounted.
3. The final unmount removes both listeners.
4. All consumers update on offline/online transitions.
5. The server snapshot remains stable at `online`, while the client synchronizes to the real browser state.

## Verification status

- Static render audit: **passed**.
- Phase-2 source invariants: **passed**.
- Full TypeScript verification could not be completed in the supplied environment because the ZIP did not contain a usable dependency installation; an attempted dependency bootstrap timed out and left the local `node_modules` incomplete.
- A global TypeScript pass was also attempted; it stopped on missing type-definition packages before reaching any diagnostics in the modified files. No diagnostics were reported for the modified source files in that run.
- The targeted Vitest command could not execute because the dependency installation was incomplete and timed out.

This limitation is environmental and is not treated as a passing test result. After installing the project's locked dependencies normally, run:

```bash
cd frontend
npm ci
npm run type-check
npm run test -- __tests__/hooks/useOnlineStatus.test.tsx
npm run perf:render-audit
```

## Deliberately deferred

No blanket `React.memo`, `useMemo`, `useCallback`, query invalidation changes, virtualization, or ChatWindow decomposition was introduced in these two phases. Those changes should be driven by runtime profiling and handled in the later rendering phases.
