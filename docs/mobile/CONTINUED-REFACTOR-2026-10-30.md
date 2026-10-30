# MarketPlat Mobile — continued refactor iteration

**Date:** 2026-10-30  
**Scope:** `apps/mobile` — inbox virtualization, conversation-row decomposition, and runtime contracts for messaging and notifications.

## Changes made

### 1. Virtualized the inbox
- Replaced `ScrollView` + `visibleItems.map(...)` in `app/messages.tsx` with `FlatList`.
- Moved the search box and filter chips into `ListHeaderComponent` so they scroll naturally with the inbox.
- Kept pull-to-refresh, inline refresh errors, an explicit load-more control, and load-more error feedback.
- Connected `onEndReached` to the existing page loader while preserving request-generation and duplicate-request guards.
- Added stable `keyExtractor`, bounded initial/batch/window rendering settings, and a dedicated separator component.
- Created `src/features/messaging/ConversationListItem.tsx` and memoized it. Rows expose button semantics and a useful accessible label including unread count.
- Added `scripts/verify-conversation-virtualization.mjs` so future changes cannot quietly restore eager rendering in a `ScrollView`.

### 2. Runtime validation for messaging and notifications
- Added Zod response schemas for conversation pages/details, message pages/sends, conversation creation, notification pages, and unread counts.
- Wired those schemas into the high-traffic methods in `src/features/messaging/messaging.api.ts`.
- The schemas enforce required identifiers and key fields while allowing additional backend fields for forward compatibility.
- Unread count accepts a non-negative integer or digit-only string and normalizes it to a number.
- Added Vitest cases for valid and malformed payloads in `src/api/__tests__/response-validation.test.ts` and a static guard `scripts/verify-messaging-api-contracts.mjs`.

### 3. Documentation and maintainability
- Updated `apps/mobile/README.md` with the current active-check count and the new inbox/API-contract architecture.
- Added this report to the mobile documentation index.

## Verification performed

| Check | Result | Meaning |
|---|---:|---|
| `node ./scripts/run-all-verifications.mjs` from `apps/mobile` | **60/60 active passed** | Includes the new virtualization and messaging-schema static guards |
| `node --test src/storage/__tests__/*.test.mjs` | **30/30 passed** | Existing durable storage/outbox tests remain green |
| TypeScript `transpileModule` syntax pass on 5 edited TS/TSX files | **5/5 passed** | This is a syntax check only, not a full type-check |
| Vitest | **Not run** | The workspace dependencies, including Zod/Vitest, are not installed in this environment |
| Full TypeScript check / ESLint / native build / Maestro | **Not verified** | Requires workspace dependency installation and/or a native runtime/device |

There are still **86 quarantined historical checks**. They are preserved and are not counted as passing. A full `type-check`, ESLint, actual runtime schema tests, Android build, and Maestro journey are still release gates.

## Remaining high-priority work

1. Install workspace dependencies in a connected environment and fix any real TypeScript/lint/test failures before merging.
2. Run the new Vitest schema cases and validate the assumed response shapes against representative backend fixtures or integration responses.
3. Run Android Maestro journey with non-production credentials and verify that the virtualized inbox and message list behave correctly at realistic data volume.
4. Continue decomposing `app/messages/[id].tsx` by extracting media/outbox orchestration only after the full type-check and integration tests are green.
5. Complete Sentry/native crash-reporting installation and physical-device session/SQLCipher checks from the previous report; these remain unimplemented/unverified, not silently closed by this iteration.
