# Marketplat — Offline UX phases 3–4

## Phase 3: consistent offline query states

- Added `frontend/components/shared/feedback/OfflineQueryFallback.tsx` as a reusable, accessible fallback for a query with no in-memory or persisted data while offline.
- Reused it for the initial loading state of product, store, ad, service, unified search, and request listings. Offline users now see an explicit explanation instead of an indefinitely pulsing skeleton.
- For offline query errors, product/ad/service/request listings no longer present a retry button that cannot work without a connection. Existing online skeletons and retry states remain the fallback when online.
- Added unit tests for the shared component.

## Phase 4: proactive warming priority hardening

- Added `PROTECTED_PUBLIC_WARMING_ROUTES`: the first public warming tranche preserves `/`, `/ads`, `/products`, `/search`, `/requests`, `/stores`, `/services`, and `/shared` before user navigation telemetry can reorder the remaining routes.
- The `/offline` hub remains pinned outside the route budget. User frequency/recency still personalizes the remaining route slots.
- Added a regression test that gives low-priority utility routes very high usage and verifies that the baseline marketplace tranche remains selected.
- Added `scripts/offline-ux-phases-3-4-audit.mjs` and the `npm run offline:ux-audit` command to check shared UX wiring, offline guards, storage/network budgets, and warming job order.

## Verification limits

The dependency-free static audits and TypeScript/TSX syntax transpilation passed for the changed TypeScript files. Unit tests, full TypeScript type-check, Next.js build, and browser-level offline/online E2E must still be run in an environment with the project's dependencies installed. Static audit success is not proof of production runtime behavior.
