# MarketPlat Mobile — refactor and repair iteration

**Date:** 2026-10-30  
**Scope:** `apps/mobile` — targeted architecture, reliability, data consistency, and UX fixes.  
**Status:** Code changes packaged; complete workspace validation remains pending because dependencies could not be installed in this environment.

## Applied changes

### 1. Single API origin and correct reachability
- Added `src/lib/api-base-url.ts` as the single source of truth for `EXPO_PUBLIC_API_URL`.
- Rejects invalid URL schemes, embedded credentials, query/hash strings, and path-prefixed URLs instead of silently producing malformed endpoints.
- `src/api/client.ts` now uses this normalizer and gives an actionable error for missing/invalid configuration.
- `src/lib/network-config.ts` probes the configured API origin (`/api/v1/categories`) or native reachability when the API origin is not configured. The previous hardcoded unrelated host is no longer used.
- Added unit cases in `src/api/__tests__/api-base-url.test.ts`.

### 2. Safer production logging
- Updated `src/lib/logger.ts`: production console output is disabled by default; debug/info remain development-only; explicit production warnings/errors are opt-in and still redacted.
- Redaction handles common secret keys and values embedded in messages, including bearer tokens and snake_case/camelCase URL query keys.
- Added tests for default release silence, message/metadata redaction, and query-parameter redaction in `src/lib/__tests__/logger.test.ts`.

### 3. Session persistence failure is no longer reported as success
- `writePersistedSession` and `clearPersistedSession` in `src/features/auth/session-storage.ts` now return `boolean` outcomes.
- `AuthContext` warns once when SecureStore cannot persist a session and explicitly warns if logout cannot confirm deletion of the persisted session.
- The in-memory session is cleared first during logout; if SecureStore deletion fails, the UI communicates that the device's stored credential state could not be confirmed.
- Added SecureStore success/failure tests in `src/features/auth/__tests__/session-storage-persistence.test.ts`.
- **Device validation remains required.** SecureStore failure paths are mocked in unit tests, not proven on physical hardware.

### 4. Ad cache coherence after mutations
- Added literal-prefix invalidation in `src/storage/public-cache.ts`, using SQLite `substr` rather than SQL `LIKE` so `%` and `_` are treated literally.
- `src/features/ads/manage-ads.api.ts` now invalidates feature-level list snapshots, public transport cache entries for ads/list/detail endpoints, and the selected ad detail after create, update, image removal/reordering, and delete.
- Update invalidates immediately after the field PATCH succeeds, so a later image-upload error cannot leave a known-stale detail/list cache untouched.
- Added tests in `src/storage/__tests__/public-cache-invalidation.test.ts`.

### 5. Messaging screen decomposition
- Extracted the message-row presentation and message-local media/failure UI from `app/messages/[id].tsx` into the memoized `src/features/messaging/ConversationMessageRow.tsx` component.
- Kept conversation loading, pagination, realtime lifecycle, outbox actions, and compose/send orchestration in the route.
- Corrected the FlatList ref generic to match the enriched screen-message type.
- This is a first decomposition step, not a claim that the whole conversation route has been fully split into hooks.

### 6. Draft-save feedback and E2E assertion
- `app/ad-editor.tsx` exposes pending/saving/saved/error status for local new-ad draft persistence, using an accessible live region.
- `.maestro/critical-journey.yaml` now waits for the saved state, navigates away, reopens the editor, and asserts the title and description are restored before proceeding to logout.
- The E2E flow is authored but has **not** been executed in this environment; it requires Android emulator, credentials, and API access.

### 7. Documentation
- Updated `apps/mobile/README.md` to reflect latest check counts and preserve the honest distinction between active and quarantined historical checks.

## Verification performed in this environment

| Check | Result | Notes |
|---|---:|---|
| `node ./scripts/run-all-verifications.mjs` from `apps/mobile` | **58/58 active passed** | 86 historical checks remain quarantined, not counted as passing |
| `node --test src/storage/__tests__/*.test.mjs` | **30/30 passed** | Durable storage/outbox test files |
| Complete `pnpm --filter @marketplat/mobile type-check` | **Not run successfully** | Workspace dependencies are absent; package install was blocked by registry connectivity (`EAI_AGAIN`) |
| Vitest suite | **Not run** | Vitest dependency is not installed in the current environment; new Vitest cases are included for CI |
| ESLint / Expo Android build / Maestro E2E / physical-device checks | **Not run** | Require installed dependencies and/or native runtime/device credentials |

## Important remaining items (not represented as fixed)

1. `@sentry/react-native` is not installed in `apps/mobile/package.json` or the workspace lockfile. `src/lib/error-reporting.ts` still correctly documents that a DSN alone does not transmit events. Actual crash reporting requires choosing/installing a compatible SDK, native rebuild, secrets, and a test event from a device.
2. Validate TypeScript, ESLint, and Vitest in connected CI before merging. The refactor adds typed tests, but they are not claimed green here.
3. Run the updated Maestro journey on Android with non-production test credentials.
4. Exercise login → refresh → restart → logout, SecureStore failure, and SQLCipher migration against a real legacy database on physical Android (and iOS if in launch scope).
5. Continue decomposition of `app/messages/[id].tsx` and `app/ad-editor.tsx` in separate small changes after the full type-check and navigation regression tests pass.
6. Review the 86 quarantined historical verifications one-by-one. Do not convert them to green by broadening ignores or deleting them.

## Suggested next gate

On a connected machine, from the monorepo root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @marketplat/mobile type-check
pnpm --filter @marketplat/mobile lint
pnpm --filter @marketplat/mobile test
pnpm --filter @marketplat/mobile test:storage
pnpm --filter @marketplat/mobile test:sqlite
pnpm --filter @marketplat/mobile exec expo config --type public
```

Then run the Android build and `.maestro/critical-journey.yaml` with test-only credentials. Merge only after fixing any real failures surfaced by those runs.
