# Axios → fetch Migration Plan (Strangler Fig)

## Axios behaviors that MUST be replicated in fetchClient
1. Base URL from `process.env.NEXT_PUBLIC_API_URL` (via `API_BASE_URL` const)
2. Default headers: `Content-Type: application/json`
3. CSRF token from cookie/store attached as `X-CSRF-Token` header
4. `credentials: 'include'` (withCredentials: true) for httpOnly cookies
5. 401 handling: single-flight refresh dedupe (`sharedRefreshPromise`), retry original once, logout on refresh failure
6. Refresh rotates csrfToken + re-sets `app_access_token` / `app_has_session` cookies
7. Network retry: safe methods only, exponential backoff via `getRetryDelayMs`, respect `Retry-After`
8. Error normalization: throw `{ status, message, data }` (via `parseApiError`)
9. Offline queue fallback: `enqueueOfflineMutationFallback` from `@/lib/offlineQueue` (reuse, do not duplicate)
10. GET deduplication via `inflightGetRequests` map
11. Session-stale detection (`__sessionCleanupVersion`, `__sessionUserId`)
12. `batchGet` helper on the client object
13. Request timeout: 15s GET / 8s mutation, 20s auth, overridable per-call
14. 202 `{queued: true}` → `OFFLINE_QUEUED` rejection shape
15. Session revoked flag (`invalidateRefreshSession` / `resumeSession` / `isSessionRevoked`)

## Files importing `@/api/client` (non-test source)
| File | Imports | Category |
|---|---|---|
| frontend/api/auth.api.ts | apiClient | (b) needs careful review — auth entrypoint |
| frontend/api/search.api.ts | apiClient | (a) safe to migrate |
| frontend/api/products.api.ts | apiClient | (a) safe to migrate |
| frontend/api/conversations.api.ts | apiClient | (b) needs careful review — messages/offline |
| frontend/api/service-listings.api.ts | apiClient | (a) safe to migrate |
| frontend/api/service-providers.api.ts | apiClient | (a) safe to migrate |
| frontend/api/service-requests.api.ts | apiClient | (a) safe to migrate |
| frontend/api/service-reviews.api.ts | apiClient | (a) safe to migrate |
| frontend/api/service-types.api.ts | apiClient | (a) safe to migrate |
| frontend/api/service-categories.api.ts | apiClient | (a) safe to migrate |
| (33 more api/*.ts) | apiClient | (a) safe to migrate |
| frontend/hooks/mutations/useAuthMutations.ts | resumeSession | (b) needs careful review |
| frontend/hooks/useAuthRestoreRetry.ts | refreshSessionShared | (b) needs careful review |
| frontend/lib/capacitor/nativePush.ts | apiClient | (a) safe to migrate |
| frontend/lib/pwa.ts | apiClient | (a) safe to migrate |
| frontend/lib/swTokenSync.ts | refreshSessionShared | (b) needs careful review |
| frontend/providers/AuthHydrationProvider.tsx | isSessionRevoked, refreshSessionShared | (b) needs careful review |

## Phase 3 migration order
1. frontend/api/sitemap.ts — does not exist (skip)
2. frontend/api/auth.api.ts — (b) review
3. frontend/api/search.api.ts — (a) safe
4. frontend/api/products.api.ts — (a) safe
5. frontend/api/services.api.ts — does not exist (use service-*.api.ts files)
6. frontend/api/messages.api.ts — does not exist (use conversations.api.ts)
7. Remaining api/*.ts files, then lib/ and hooks/ consumers

## Exclusions (never touch)
- frontend/app/error.tsx, frontend/app/global-error.tsx
- Any "use client" file with no axios dependency