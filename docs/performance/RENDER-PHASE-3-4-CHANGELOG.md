# Render Performance — Phases 3 & 4

## Scope

This patch builds on phases 1–2 and targets the two highest-frequency render surfaces found in the audit:

1. Card/list rendering.
2. Conversation/message rendering and the message composer.

The goal is to reduce unnecessary React reconciliation without changing API contracts, query keys, message semantics, or user-visible behavior.

## Phase 3 — Cards

### 1. Memoized high-frequency cards

The following cards are now wrapped with `React.memo`:

- `components/ads/AdCard.tsx`
- `components/stores/ProductCard.tsx`
- `components/services/ServiceListingCard.tsx`
- `components/stores/StoreCard.tsx`

These are high fan-out components used by home rails, search, catalogs, favorites, recommendations, related lists, and mixed feeds.

The memo boundary is intentionally placed at the exported component rather than adding `useMemo` around JSX. This allows React to skip the complete card subtree when its input props are unchanged.

### 2. Shared post-mount timestamp

`useNowAfterMount` previously used one `useState` + `useEffect` pair per card. A list with N cards therefore caused N independent post-mount state updates.

It is now a singleton external snapshot consumed through `useSyncExternalStore`. The public contract remains:

- server/initial snapshot: `null`
- after mount: one shared timestamp

All mounted card consumers synchronize to the same timestamp update.

### 3. Avoid duplicate connectivity subscription in AdCard

`AdCard` needs online state for favorite interaction, while its offline badge also needs the same state. A pure `CardOfflineBadgeView` was introduced so `AdCard` has one connectivity subscription instead of two.

Other cards continue to use `CardOfflineBadge`, which subscribes to the centralized phase-2 connectivity store.

## Phase 4 — Chat

### 1. Message row extraction

The large inline `messages.map()` rendering block was extracted from `ChatWindow` into:

`components/messages/ChatMessageRow.tsx`

`ChatMessageRow` is memoized and receives primitive/stable rendering inputs plus stable callbacks. This changes the rendering boundary from:

`ChatWindow -> every message JSX`

to:

`ChatWindow -> memo(ChatMessageRow) x N`

Parent-level UI state such as dialogs, safety tip, media sheet, jump-to-latest state, and typing state no longer requires React to reconcile the complete message bubble JSX when the individual row inputs are unchanged.

### 2. Stable parent callbacks

Queue actions and message-mark actions are exposed to rows through `useCallback`-stabilized handlers.

The failed-message action keeps its original semantics:

- Retry -> retry queue operation.
- Edit -> dispatch the existing `offline-message-edit` event.
- Cancel failed send -> `cancelQueuedMessage`.
- Delete pending send -> `discardQueuedMessage`.

### 3. Recording timer isolation

The recording clock was previously state inside `MessageInput` and updated every 250ms. That meant the whole composer tree was re-rendered four times per second while recording.

A dedicated memoized `RecordingTimer` now owns the clock and updates at 1Hz. `MessageInput` only changes when recording starts/stops; timer ticks remain local to the timer component.

The visible format remains `m:ss` and the recorder still uses its original `MediaRecorder.start(250)` data cadence; only the UI clock cadence changed from 250ms to 1000ms.

## Verification

### Static render audit

Command:

```bash
npm run perf:render-audit
```

Current output:

- `useOnlineStatusFiles`: 40
- `useOnlineStatusCalls`: 57
- raw `online/offline` listener registrations found statically: 14
- `useNowAfterMountFiles`: 4
- `reactMemoOccurrences`: 6

The memo count includes the four card boundaries and the new chat row/timer boundaries plus existing memo usage.

### TypeScript

A global TypeScript compiler was available, but `node_modules` is not present in the supplied project archive. Therefore a full project type-check cannot be considered authoritative because React/Next/third-party type packages are unavailable.

The compiler was still used as a syntax/static pass. After the implementation fixes, there are no parser errors and no project-local semantic errors attributable to the new chat extraction/timer structure. Remaining diagnostics are dominated by missing dependencies and pre-existing project-wide implicit-any diagnostics.

### Runtime profiling

No runtime render-count claim is made from static analysis alone. The next verification step should run React DevTools Profiler against representative flows:

- search/catalog list update
- favorite toggle
- connectivity transition
- opening a 50-message conversation
- incoming message while reading history
- recording for 10+ seconds

## Deliberately not changed

- React Query keys/configuration.
- Zustand architecture.
- Message pagination/virtualization.
- Query invalidation strategy.
- Message business logic.
- Media upload behavior.

Those are separate performance dimensions and should be measured before changing them.
