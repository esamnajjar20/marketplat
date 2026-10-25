# Phase 3 — User journey shell improvements

## Scope
This increment improves shared page-shell behavior without restructuring page routes or business logic.

## Changes
- `apps/web/components/shared/account/AccountPageShell.tsx`: account-page action controls can wrap onto a full-width row on narrow screens instead of being forced into a non-shrinking header row.
- `apps/web/components/shared/legal/LegalPageShell.tsx`: legal/about navigation links now have a 44px minimum target, visible keyboard focus, and reduced-motion handling.
- `apps/web/components/shared/list/ListPageShell.tsx`: links and buttons placed in the shared browse toolbar receive a 44px minimum height and touch-manipulation hint.
- `apps/web/scripts/user-journey-shell-audit.mjs`: adds six static contract checks for these behaviors.
- `apps/web/package.json`: registers `npm run ux:user-journey-shell-audit`.

## Validation performed
- `node scripts/user-journey-shell-audit.mjs`: 6/6 passed.
- `node scripts/design-system-token-contract-audit.mjs`: 23/23 passed.
- `node scripts/app-shell-navigation-audit.mjs`: 14/14 passed.
- `node --check scripts/user-journey-shell-audit.mjs`: passed.

## Limitations
These are static source-contract checks. No Next.js build, TypeScript check, Vitest, Playwright, or physical-device validation was run because the supplied archive does not include `node_modules`. This phase does not resolve the previously documented missing audit-script references in `package.json`.
