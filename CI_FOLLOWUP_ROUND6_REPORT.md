# Marketplat — CI Follow-up Round 6

## Source log reviewed
`logs_105086291981.zip` (CI workflow SHA shown in logs: `1aac67dd50d04764713a8db259c7bf1bfddfa32a`).

## Baseline findings from the uploaded CI run

- Frontend full unit run: **59 failed test files, 393 passed, 452 total; 170 failed tests reported**.
- Backend unit run: **242 suites passed; 3,064 tests passed**.
- Backend integration run: **10 failed suites, 20 passed; 25 failed tests, 379 passed, 1 skipped**.
- Query-key architecture check: **4 files and 117 tests passed**.
- Frontend lint: **0 errors, 46 warnings**.
- Backend lint: **0 errors, 11 warnings**.
- Database migrations completed successfully.
- Backend and frontend Docker image build checks completed successfully.
- Type-check steps produced no reported TypeScript errors in the captured logs.

The new archive is a targeted follow-up based on the prior round-5 project archive. It addresses several concrete root causes identified in the logs; it is **not a claim that all 59 frontend files or all 10 backend integration suites are now passing**.

## Changes in this round

### Backend

1. `backend/tests/setup.ts`
   - Added Redis Set support (`SADD`, `SCARD`) to the shared test double and pipeline.
   - CI showed login requests failing with `TypeError: pipeline.scard is not a function`; the mock lacked commands used by `tokenStore.getIpStats` and failed-login tracking.

2. `backend/src/modules/sales/sales.service.ts`
   - Single-product sales now store `productId` on the `SaleItem`, so return and sale-deletion stock restoration can locate the inventory row.

3. `backend/tests/integration/sales.flow.test.ts`
   - Corrected the multi-product POS fixture total. Its line totals are `(8 - 1) * 2 + (8 - 0) * 1 = 22`, not 23; the old fixture requested a payment larger than the calculated total and received HTTP 400.

4. `backend/tests/integration/auth.extended.test.ts`, `auth.security.test.ts`, `users.extended.test.ts`, `forgotPassword.test.ts`
   - Replaced weak registration fixture passwords with `TestPassword123!` where the test directly registers users, matching the current password policy.
   - Preserved `password123` in the forgot-password assertion that verifies the original password of a user created directly by the test helper.

5. `backend/tests/integration/auth.test.ts`
   - Updated the session-hint cookie assertion to match the implementation's explicit HttpOnly policy. The hint contains no secret; server-side middleware can read it, and making it HttpOnly prevents client-side script from altering it.

6. `backend/tests/integration/recommendations.test.ts`
   - Added enough eligible alternative ads to test the normal owned/favorited exclusion behavior without triggering the service's documented last-resort backfill for small catalogs.

### Frontend

7. `frontend/__tests__/components/ProductsGrid.test.tsx` and `StoresGrid.test.tsx`
   - Added `usePathname` to navigation mocks. CI showed the grids failing because the shared sort bar now reads the current pathname.

8. `frontend/__tests__/unit/lib/pwa.test.ts`
   - Added the `registration.update()` mock. Production registration checks updates after registering; the incomplete test registration object caused successful registration tests to return `null`.

9. `frontend/__tests__/unit/lib/offlineMessagesStore.test.ts`
   - Uses a current timestamp for the conversation fixture. The production store intentionally removes conversations older than 30 days, so the old January 2026 fixture was correctly expired in the October 2026 CI run.

10. `frontend/__tests__/unit/lib/cacheVersionSync.test.ts`
    - Checks exported `SW_CACHE_LIMITS` values rather than assuming the policy keeps numeric literals inline. The policy now delegates to `CACHE_POLICY`.

11. `frontend/__tests__/unit/lib/offlineWarmingPlanner.test.ts`
    - Resets the mutable network-policy mock in a test located outside the suite-level `beforeEach`, preventing a prior test's disabled-warming state from leaking into the 3G case.

12. `frontend/lib/offlineRouteShells.ts`
    - Moves `/saved-payments` into the early core warming tranche, so the local-only page linked from the offline hub is not omitted by the normal bounded warming selection.

## Validation limitations

- The uploaded CI logs describe the state before these follow-up edits.
- This environment does not have the project's installed `node_modules`, and dependency downloads have previously been unavailable. Therefore this round has **not** been rerun through Vitest/Jest locally.
- The archive must be run through CI to confirm which failures are resolved and to reveal the next remaining failures.

## Remaining high-priority work indicated by the uploaded logs

- Frontend: continue through the remaining failures, especially Service Worker/offline queue behavior, mutation/query hooks, forms, navigation, and cards.
- Backend integration: investigate remaining failures in appointments, Google OAuth redirect/linking expectations, forgot-password flows, requests authorization, sales returns/POS behavior beyond the fixes above, and account/session flows after the Redis mock repair.
- Re-run the full frontend unit suite and backend integration suite before declaring completion.
