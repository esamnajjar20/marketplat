# Offline Center Audit — 2026-10-04

## Scope

Second security/reliability audit of the MarketPlat offline center and its supporting offline infrastructure:

- Service Worker fetch/cache policy
- IndexedDB mutation queue and replay
- logout/account-switch cleanup
- owner-scoped offline data
- self-data warming
- protected route classification
- retry/clear concurrency
- regression coverage

## Fixed findings

### 1. Owner-scoped offline lists were not actually scoped at read/write sites
`offlineListCache.ts` already supported `userId`, but `useMyActivity`, `useSavedSearches`, and `useMyAds` omitted it. A crash/force-close followed by another account signing in could therefore expose the previous account's cached activity, saved searches, or own ads as offline initial data.

**Fix:** pass the current `userId` to all reads and writes for those private slots.

### 2. Self-profile warming discarded the owner identity
`warmSelfDataForOffline()` wrote seller/store/service-provider data without `userId`, while the corresponding query hooks now require owner matching. The warmup therefore produced data that was intentionally rejected by the safer readers.

**Fix:** thread the authenticated `userId` through all self-warm call sites and persist it with the private cache entries.

### 3. Offline activity history was not cleared at session boundaries
The local activity log could survive logout/account switching and contained session-specific offline messages/counts.

**Fix:** clear the offline activity log in centralized sensitive-session cleanup.

### 4. Legacy ad-edit route was outside Service Worker protected-page classification
The application proxy protects `/ads/:id/edit`, but the Service Worker did not. That allowed the route to pass through the public page-cache strategy even though the route is protected and redirects into the authenticated editing flow.

**Fix:** add the same protected-route regex to the Service Worker and deliberately keep it out of the personal shell cache.

### 5. Queue cleanup on logout was not actually awaited
`clearOfflineQueue()` only posted `CLEAR_QUEUE` to the Service Worker and immediately resolved. `authCleanup.ts` therefore appeared to await cleanup while the IndexedDB deletion could still be running.

**Fix:** wait for `QUEUE_CLEARED`/`QUEUE_CLEAR_FAILED` with a bounded timeout, with a direct IndexedDB clear fallback.

### 6. Queue clearing could race an in-flight replay
A queued mutation could already be on the network while logout started deleting its IndexedDB row. The server could still receive that mutation after local session teardown.

**Fix:** Service Worker queue clearing now blocks new replay work, aborts active replay fetches, clears the queue, and acknowledges completion.

### 7. Manual retry could bypass the replay mutex
The failed-item retry path could call `replayQueueImpl()` directly after checking the lock, leaving a race window where another replay started during the refresh delay.

**Fix:** manual retry now goes through the shared `replayQueue()` lock.

### 8. Queue entries now carry an owner marker without storing the access token
The queue previously removed the Authorization header for security, but did not retain an identity marker. This made defense-in-depth against stale cross-account queue rows weaker.

**Fix:** decode only the JWT `userId` claim at enqueue time, store that non-secret identifier, and compare it with the fresh token owner before replay. Legacy rows can derive the owner from their old Authorization header when present.

## Regression coverage added

- Protected `/ads/:id/edit` route classification.
- Owner-scoped offline activity/saved-search/my-ads cache calls.
- User-scoped self-profile warming.
- Session cleanup of offline activity.
- Queue-clear acknowledgement and fallback contract.

## Validation performed

- TypeScript/TSX transpilation check: passed for all changed TS/TSX files.
- `public/sw.js` JavaScript parse check: passed.
- Service Worker VM smoke test: passed for protected-route classification and JWT owner decoding.
- File comparison against the original project snapshot: only the files in this session's patch were changed.

## Not run

A full `npm test`, `npm run type-check`, or `next build` was not possible from the supplied project snapshot because `frontend/node_modules` is absent. This is an environment limitation, not a reported test failure.
