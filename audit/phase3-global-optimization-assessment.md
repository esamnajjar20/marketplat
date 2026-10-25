# Phase 3 — Heavy Dependencies (Global Optimization Campaign)

## Scope
Replace heavy client dependencies (`axios`, `@fontsource`, infinite scroll `IntersectionObserver`) with lighter/native alternatives where safe.

## 3A — Replace `axios` with native `fetch` / `ky`

### Safety net (already satisfied — no change required)
The files explicitly named in the safety net already use native `fetch` and TanStack Query's `useMutation` with `networkMode: 'offlineFirst'`, so the PWA offline message queue is intact:

- `apps/web/lib/sendConversationMessage.ts` — uses native `fetch` (credentials: 'include', CSRF + Bearer headers), zero `axios`.
- `apps/web/hooks/mutations/useConversationMutations.ts` (`useSendMessage`) — `useMutation({ networkMode: 'offlineFirst', ... })` wrapping `sendConversationMessage`.
- `apps/web/components/messages/MessageInput.tsx` — consumes `useSendMessage`; zero `axios` / `@/api/client`.

Verified: `grep axios|@/api/client|apiClient` returns empty for all three files.

### Deferred / accepted tech debt
All remaining `axios` / `@/api/client` usage in `"use client"` files is concentrated in auth-critical infrastructure that cannot be safely or piecemeal migrated:

- `apps/web/api/client.ts` (986 lines): the axios singleton with token refresh, silent-refresh queue, CSRF rotation, `withCredentials: 'include'`, offline-queue fallback (`enqueueOfflineMutationFallback`), retry policy, and network observability.
- `"use client"` auth hooks consuming `resumeSession` / `refreshSessionShared` from `@/api/client`: `hooks/mutations/useAuthMutations.ts`, `hooks/useAuthRestoreRetry.ts`, `lib/offlineWarmingUserData.ts`.
- Other `apiClient` consumers: `lib/capacitor/nativePush.ts`, `lib/pwa.ts`, `lib/swTokenSync.ts`, `lib/authCleanup.ts`.

Replacing these piecemeal with `fetch` would require reimplementing the entire auth refresh / CSRF / cookie / offline-queue / retry stack. That carries a high risk of breaking offline queuing (PWA), which the campaign rules forbid ("NEVER break offline queuing"). It also cannot be verified without a production build (only `npm run type-check` is run per phase), and `ky` is not installed.

Decision: deferred. Documented as **accepted tech debt**. Retry once the server-side data layer is on lightweight native `fetch` so the client dependency graph can shrink without reintroducing the axios graph.

## 3B — Convert infinite scroll to Load More (/products, /services, /stores)

### Status: deferred (per safety net)
`apps/web/components/shared/list/InfiniteScrollTrigger.tsx` already renders a Load More button (`تحميل المزيد`) as a keyboard/fallback alongside IntersectionObserver prefetch, so the explicit-interaction path exists.

A full conversion to "Server Component renders initial data + client Load More button fetches next page" was already experimented on in this project and **reverted** due to bundle-size regressions (see `audit/rsc-report.md`):
- `/products` server-fetch: 119 kB → 154 kB (+29.4%) — reverted
- `/products` server + Load More: 119 kB → 248 kB (+108.4%) — reverted/deferred
- `/stores` server + Load More: 116 kB → 231 kB (+99.1%) — reverted/deferred

The reports cite the Axios `apiClient` dependency graph as the bloat source and recommend retrying with native `fetch` on the server and Load More leaf.

Decision: deferred. Bundle-size impact cannot be measured without a production build (excluded per phase rules), so the safety net applies: revert and document as **DEFERRED**.

## Verification
- `npm run type-check` (frontend `tsc --noEmit`) passes after Phases 1–2.
- No Phase 3 code changes were made, so no regressions introduced; offline queuing (PWA) is preserved.
