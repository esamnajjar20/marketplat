# Final hydration / React #418 audit

## Additional issue fixed in this pass

- `frontend/components/messages/ChatMessageRow.tsx` previously called `messageDayLabel(message.createdAt)` with an implicit `new Date()` default. Near a day boundary, the server and browser could classify the same message as “today” versus “yesterday”, creating a hydration mismatch. It now uses the shared post-mount clock and renders a stable placeholder before the clock is available.
- `frontend/lib/messageUtils.ts` now requires an explicit `now` argument for `messageDayLabel`, preventing future callers from accidentally reintroducing an implicit server/client clock dependency.
- `frontend/scripts/render-regression-audit.mjs` now checks these protections so this specific regression is caught by the static guardrail.

## Included remediation from the prior patch

- Relative-time UI uses the shared hydration-safe clock.
- Date formatting that is displayed in UI uses the explicit `Asia/Gaza` time zone where applicable.
- Installment schedule dates are created only after mount and cannot be submitted before initialization.
- Existing safe handling for online status and browser data remains unchanged.

## Verification

- `node frontend/scripts/render-regression-audit.mjs`: PASS, including the new ChatMessageRow clock checks.
- `node frontend/scripts/cache-contract-audit.mjs`: PASS (23 domains, 16 rules).
- `node frontend/scripts/warming-final-audit.mjs`: the warming checks pass through the manifest checks, but its final pipeline assertion fails in this checkout. This appears unrelated to the hydration changes and has not been changed here.
- The cache-performance and cache-final audit scripts could not run cleanly because their path resolution expects `backend/` and `shared/` outside the project root; they report missing paths in this checkout. This is an existing audit-script/layout issue, not evidence of a hydration failure.
- TypeScript, unit tests, Next.js build, and browser-based hydration reproduction were not run because frontend dependencies are not installed in this environment. Runtime confirmation of the original React #418 still requires the actual browser/server error and logs.

## Scope

This is a source-level remediation and audit. It reduces the identified hydration risks but does not claim that every possible React #418 or HTTP 418 cause is resolved without reproducing the original error.
