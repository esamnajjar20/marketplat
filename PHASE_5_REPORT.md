# Phase 5 — Offline UX: honest sync-center loading and failure states

## Changes
- `apps/web/components/settings/SyncCenterClient.tsx`
  - Added `aria-busy` to communicate loading/sync activity to assistive technology.
  - Replaced potentially misleading zero counts with an em dash when local reads fail.
  - Distinguished loading, confirmed-empty, and read-failure states for favorites, appointment drafts, ad drafts, and failed queued requests.
  - Made the manual-sync spinner respect `prefers-reduced-motion`.
- `apps/web/scripts/sync-center-loading-states-audit.mjs`
  - Added a dependency-free static audit for these UX guardrails.
- `apps/web/package.json`
  - Added `ux:sync-center-loading-audit`.

## Validation performed
- `node scripts/sync-center-loading-states-audit.mjs`: 10/10 passed.
- `node scripts/offline-phase5-queue-audit.mjs`: 11/11 passed.
- `node --check scripts/sync-center-loading-states-audit.mjs`: passed.
- `apps/web/package.json` parses as valid JSON as part of the audit.

## Limitations
This was a source/static validation. A Next.js build, TypeScript check, browser automation, and physical-device/offline-network tests were not run because dependencies/browser runtime are not installed in this extracted project workspace. This phase does not claim to prove live sync success or backend behavior.
