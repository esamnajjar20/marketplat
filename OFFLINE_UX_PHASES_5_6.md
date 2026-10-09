# Marketplat — Offline UX phases 5–6

## Phase 5: safe actions while offline

- `OfflineActionGate` now uses the native `inert` attribute when an action is gated offline. `pointer-events-none` alone does not block keyboard focus or activation; `inert` prevents interaction with descendants while preserving the explanatory status message.
- Added component tests for the offline notice, inert behavior, and restoration when online.

## Phase 6: offline/online lifecycle regression coverage

- Added a Playwright browser test for `/offline?tab=sync` that checks online status, simulates offline mode through the browser context, verifies the offline status, then restores the connection and verifies recovery without a page reload.
- Added `npm run offline:ux-phases-5-6-audit` for dependency-free checks of the new guard and lifecycle coverage.

## Verification limits

The static phase audit can run without installing dependencies. The Vitest and Playwright tests require project dependencies; the Playwright test additionally requires the configured app/backend stack and an installed Chromium browser. Passing the static audit does not claim those runtime tests passed.
