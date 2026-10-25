# Phase 2 — App Shell & Navigation Hardening

## Scope
This phase continues from the cleaned MarketPlat project ZIP supplied in this conversation. It focuses on shared authenticated navigation, mobile navigation accessibility, and repeatable static guardrails. It does not redesign the application shell from scratch.

## Changes
- `apps/web/components/layout/ProtectedSidebar.tsx`
  - Raised sidebar link and disclosure-row minimum height from Tailwind `min-h-10` (40px) to `min-h-11` (44px).
  - Added a visible keyboard focus ring offset to sidebar links and disclosure controls.
  - Added reduced-motion handling to disclosure transitions.
- `apps/web/scripts/app-shell-navigation-audit.mjs` (new)
  - Added 14 static checks for touch target size, keyboard focus, disclosure state, route prefetch policy, mobile nav semantics, reduced motion, main-content skip targets, mobile bottom-nav spacing, and conversation-thread layout.
- `apps/web/package.json`
  - Added `app-shell:navigation-audit` script.

## Validation performed
- `node scripts/app-shell-navigation-audit.mjs`: 14/14 passed.
- `node scripts/device-error-monitor-audit.mjs`: 15/15 passed.
- `node scripts/network-request-monitor-audit.mjs`: 13/13 passed.
- `node scripts/design-system-token-contract-audit.mjs`: 23/23 passed.
- `node --check scripts/app-shell-navigation-audit.mjs`: passed.

These are static/source-contract checks. A Next.js production build, TypeScript check, Vitest/Playwright run, and physical Android/PWA validation were not performed because the source archive does not include `node_modules` and the Git metadata needed to compare with the user's actual working tree.

## Carry-forward caveats
- `apps/web/package.json` still references 36 audit scripts absent from the supplied archive. They were not fabricated or silently removed in this phase.
- The prior cleanup removed scripts based on whether their names appeared directly in `package.json`; that criterion alone does not prove a script is unused by every other file. Review `PHASE_0_1_SCRIPT_CLEANUP_REPORT.md` before adopting that cleanup in a live repository.
- The ZIP is based on the supplied archive, not a live GitHub checkout; it must not be described as synchronized with the user's current branch.
