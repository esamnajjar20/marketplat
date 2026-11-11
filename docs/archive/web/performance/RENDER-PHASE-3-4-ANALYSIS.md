# Deep Analysis — Render Performance Phases 3 & 4

## Findings addressed

### Finding A — high fan-out cards lacked render boundaries

Cards were exported as ordinary function components. A parent list render therefore reconciled every card even when the card's input object and display configuration were unchanged.

The fix is `React.memo` at the card boundary. No custom comparator was introduced: the project uses object props whose identity is meaningful, and a custom comparator would risk hiding legitimate updates or creating an expensive comparison that costs more than reconciliation.

### Finding B — one-time `now` state was multiplied by list size

The old hook performed an effect and state update for each consumer. The value did not need to be independently owned by each card. A shared external snapshot is a better fit because the value is a read-only application-wide timestamp for a render pass.

### Finding C — AdCard subscribed twice to the same external signal

The card itself needs online state and the badge independently subscribed. Phase 2 centralized browser listeners, but duplicate React subscriptions still caused two subscription paths per AdCard. `CardOfflineBadgeView` removes the second path without weakening the centralized browser store.

### Finding D — ChatWindow contained a large high-frequency rendering surface

Message JSX lived inside a 900+ line parent. State unrelated to an individual message could cause the parent to reconcile every message row.

Extraction to `ChatMessageRow` creates a real React boundary. The row remains responsible for message-specific UI and receives only the state needed to render it.

### Finding E — MessageInput timer caused high-frequency parent renders

A 250ms interval updated `recordingSeconds` in the composer. This was unnecessarily frequent for a human-readable `m:ss` label and caused all composer JSX to be evaluated repeatedly.

The timer is now isolated and updates once per second. MediaRecorder's own 250ms capture cadence remains untouched.

## Why no custom memo comparator?

A custom comparator would need to understand nested `ad`, `product`, `listing`, and `store` objects. That is both fragile and potentially expensive. The safer first step is to preserve referential stability from the existing query/cache layers and use standard shallow `memo`.

## Expected impact

The largest expected gains are not raw CPU savings from `memo` itself. They come from reducing the amount of component work that is reachable from unrelated parent state changes:

- list containers can update without rebuilding unchanged cards;
- chat-level state can update without rebuilding unchanged message rows;
- recording time updates no longer rebuild the composer;
- shared timestamps remove N independent mount effects from card lists.

Actual render-count and commit-duration improvements must be confirmed with React DevTools Profiler; this patch does not fabricate those numbers.
