# MarketPlat — Phase 4: Shared feedback and motion

## Scope
- Updated `apps/web/components/shared/feedback/LoadingSpinner.tsx` so spinner rotation and pulse stop when the user requests reduced motion.
- Updated `apps/web/components/shared/feedback/EmptyState.tsx` to explicitly suppress its entrance animation under reduced-motion preferences.
- Marked the purely decorative page progress bar in `apps/web/components/shared/feedback/PageLoadingState.tsx` as hidden from assistive technology.
- Added `apps/web/scripts/feedback-motion-audit.mjs` and registered `ux:feedback-motion-audit` in `apps/web/package.json`.

## Verification
- `node scripts/feedback-motion-audit.mjs`: 7/7 checks passed.
- `node --check scripts/feedback-motion-audit.mjs`: passed.
- No full Next.js build, TypeScript check, browser test, or physical-device test was run; dependencies are not installed in the supplied archive.

## Notes
This is a focused Phase 4 increment, not a claim that all interaction states across the application have been fully standardized. Existing business logic and page structure were not intentionally rewritten.
