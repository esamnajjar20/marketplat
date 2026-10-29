# Phase 2 — architecture cleanup

## Done

### Home (`apps/mobile/app/index.tsx`)
- Orchestration-only screen.
- Uses existing **`useHomeScreenState`** (search, filters, sort, favorites via **`useFavorites`**).
- Data via **`useHomeAds`** + **`useHomeServices`**.
- Inline filter/favorite/state logic removed from the screen body.

### Ad editor
- **`useAdEditorCategories`** loads/flattens categories.
- Draft/submit/offline paths still on the screen (candidate for Phase 2b).

### Storage
- **`outbox-manager.ts`**: façade for `getOutboxSnapshot`, pending counts.
- **`src/storage/README.md`**: `.ts` vs `.mjs` policy (`.ts` is source of truth).

### State
- **`src/state/session-flags.ts`**: process-wide outbox badge counter without adding Zustand yet.

## Deferred
| Item | Notes |
|------|--------|
| Zustand | After lockfile install on a real machine |
| `useAdEditorDraft` | Dense submit/offline paths |
| offline-queue → outbox-manager | Gradual migration |
| Delete redundant `.mjs` | Needs test runner change |

## Acceptance
- [ ] `pnpm --filter @marketplat/mobile type-check`
- [ ] Home: search, filters, favorites, pull-to-refresh
- [ ] Ad editor: categories list loads
