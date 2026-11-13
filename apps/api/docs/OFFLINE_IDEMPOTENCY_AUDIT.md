# Offline idempotency audit

## Request-header validation (v63)

The API validates `X-Offline-Op-Id` globally when present. Accepted values are 1–128 characters from `[A-Za-z0-9._:-]`; missing headers remain valid for online requests. This rejects duplicate header arrays, whitespace/control characters, and oversized values before route handlers consume them. The middleware is input hygiene, not the idempotency boundary: handlers must still scope keys to the authenticated owner, and database uniqueness/transactions remain necessary to prevent concurrent duplicates.

Unit test: `tests/unit/offlineOperationId.middleware.test.ts`. Run with `npm run test:unit -- offlineOperationId.middleware.test.ts` from `backend` after installing dependencies.

## Retry and account-isolation coverage (v64)

`tests/integration/sales.flow.test.ts` now covers concurrent requests using the same operation ID and verifies that they resolve to one sale with one payment record. A second scenario sends the same operation ID under two authenticated sellers and verifies that each seller receives a separate sale. This protects the intended per-owner idempotency scope and catches regressions in the `@@unique([sellerId, offlineOperationId])` database constraint.

Run the source-level guard with `npm run audit:offline-idempotency-concurrency`. Run the actual database-backed tests with `npm run test:integration -- sales.flow.test.ts` in an environment with dependencies, a reachable test database, and the required test setup. The source-level guard is not a substitute for running the Jest integration suite; the database-backed scenarios were added but were not executed during this patch build.

### v65 — committed sale replay side effects

The sales integration suite now includes a lost-acknowledgement replay scenario: it creates a product sale, repeats the same request with the same `X-Offline-Op-Id`, and asserts that the sale ID remains stable, inventory is decremented once, customer purchase totals are updated once, and one payment row exists. Run it with `npm run test:integration -- --runInBand tests/integration/sales.flow.test.ts` against the configured test database. This scenario is authored but must be executed in the project's test environment; the source audit only verifies that the assertions exist.


### v66 — idempotency key scope: decision and guard

Two scopes coexist today:

- **Owner-scoped composite unique:** `SaleRecord @@unique([sellerId, offlineOperationId])`, `Message @@unique([senderId, clientOperationId])`, marketplace orders `@@unique([buyerId, idempotencyKey])`.
- **Global unique `offlineOperationId`:** `Ad`, `Product`, `ServiceListing`, `Request`, `ServiceRequest` (and a few related rows).

Decision: the global-unique rows are **kept as they are** for now. Every one of them is protected by (a) client-generated random operation ids (UUID or CSPRNG-backed tokens where the platform provides one; a `Math.random` fallback remains only where no secure source exists, so ids are collision-resistant but **must not be treated as secrets**), and (b) an explicit owner check on replay (`existing.userId !== userId`, `existing.storeId !== store.id`, `existing.providerId !== provider.id`, `existing.customerId !== customerId`) that is asserted by `scripts/offline-idempotency-complete-audit.mjs` and `frontend/scripts/offline-phase8-idempotency-scope-audit.mjs`. The owner check — not id unpredictability — is the primary safeguard. The residual effect of a collision is a rejected request for the colliding caller, never access to another owner's record.

Converting those columns to owner-scoped composite uniques is a schema migration touching five models, their repositories (`findUnique({ where: { offlineOperationId } })` becomes a composite lookup) and tests. It should be done as its own change with the integration suite running against a real database, not bundled into a patch that cannot execute Prisma. When it is done, update the two audit scripts above (they currently assert the global-unique shape).

Both audit scripts previously pointed at pre-monorepo paths (`../web`, `backend/src/modules/ads/...`, `app.ts` for CORS) and failed before checking anything. They now resolve paths from their own location and pass (16/16 and 13/13).
