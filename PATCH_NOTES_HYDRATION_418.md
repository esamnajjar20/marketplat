# Hydration / React #418 remediation patch

## Changes
- Added `frontend/components/shared/HydrationSafeRelativeTime.tsx`, using the existing shared post-mount clock so server output and the first hydration render are identical.
- Replaced direct relative-time formatting in SSR-rendered UI rows/cards with the hydration-safe component; existing card views that already used the shared clock remain unchanged.
- Standardized date/time formatting to the `Asia/Gaza` timezone where rendered dates are formatted, and updated message-day calculations to use that timezone rather than the host runtime timezone.
- Updated relative-time short-date calendar calculations to use `Asia/Gaza` calendar days.
- Changed installment schedule generation so it reads `Date.now()` only after mount; the initial server/client render shows a stable placeholder and the submit action is disabled until rows are ready.

## Validation
- `node frontend/scripts/render-regression-audit.mjs`: PASSED.
- `node frontend/scripts/render-audit.mjs`: completed; static source metrics only.
- `tsc --noEmit`: could not complete successfully because this checkout has no installed frontend dependencies/types (for example `react`, `next`, and `axios` are missing). The command also reports existing project-wide type errors; runtime/build verification therefore remains outstanding.

## Scope note
This patch addresses the hydration-risk patterns identified in the preceding static review. It does not prove every possible React #418 or HTTP 418 cause is fixed; the exact runtime error and server logs are still needed to confirm the original trigger.
