# MarketPlat — Auth and User Lifecycle Hardening

This change set hardens the existing identity implementation; it does not replace the authentication architecture.

## What changed

- Every authenticated request and refresh/Google step-up flow now checks that the JWT's `(userId, sessionId)` still has a live Redis session metadata record. Revoking one session or all sessions therefore invalidates the corresponding Access Tokens on the next request, across API workers. Authentication fails closed if Redis cannot verify the session ledger.
- Single-session deletion and all-session deletion are atomic Redis Lua operations. Updating `lastSeen` is also atomic and cannot recreate metadata after a concurrent logout/revocation.
- User-cache projections include `needsProfileCompletion`; incomplete Google-created accounts are gated by API middleware as well as the mobile root layout, with narrowly scoped profile/session recovery exemptions.
- Email reads and writes normalize addresses. The repository rejects ambiguous case-insensitive duplicates instead of authenticating an arbitrary record.
- Password-reset and email-verification links store SHA-256 digests for newly issued tokens. Unexpired legacy plaintext rows remain redeemable during rollout; successful redemption converts the row to digest-only storage. Verification is idempotent after the account is already verified, and token claims are atomic.
- Password changes and resets revoke every session. Account deletion revokes sessions before the database anonymization transaction, removes provider credentials and auth tokens, clears device push registrations, and invalidates public projections.
- Google-only users can complete deletion step-up through the linked Google identity on web and native mobile. Native deletion uses a session-bound short-lived OAuth flow and one-time PKCE receipt; JWTs are not placed in deep links.
- A partially persisted login/register session is removed if cache/session setup fails, avoiding orphaned Redis session records.

## Database rollout — required

1. Take and verify a PostgreSQL backup before deployment.
2. Check for case/whitespace duplicates before applying the migration:

   ```sql
   SELECT LOWER(BTRIM(email)) AS normalized_email,
          COUNT(*) AS duplicate_count,
          ARRAY_AGG(id ORDER BY created_at) AS user_ids
   FROM users
   GROUP BY LOWER(BTRIM(email))
   HAVING COUNT(*) > 1;
   ```

3. Resolve any returned groups manually. The migration intentionally raises an exception rather than guessing which account should survive.
4. Deploy the migration and regenerate Prisma Client:

   ```bash
   pnpm --filter classifieds-platform-backend prisma:migrate:deploy
   pnpm --filter classifieds-platform-backend prisma:generate
   ```

5. Deploy the API before relying on the new digest-only token writes. The code accepts unexpired legacy plaintext tokens during the transition.

The migration normalizes existing user emails to lowercase/trimmed form, adds a `LOWER(BTRIM(email))` unique index and normalized-value check, and adds nullable `token_hash` columns while allowing legacy token rows until expiry.

## Operational compatibility

- Existing Redis sessions created before this release may not have `session_meta:<userId>:<sessionId>` keys if an old deployment did not persist metadata consistently. Those sessions will be rejected by design and users will need to sign in again.
- The API must have working Redis connectivity for authenticated requests. This is intentional fail-closed behavior because Redis now carries the authoritative revocation ledger.
- `EMAIL_VERIFICATION_GATING` remains configurable and keeps its existing default (`false`). This change does not silently force email verification for every user; enable the gate only after confirming email delivery and the desired product policy.
- Account deletion remains a soft-delete/anonymization operation to preserve relational and marketplace history. It deactivates the account, removes identity/provider credentials and private authentication/device tokens, hides active ads and public projections, and attempts Cloudinary cleanup. It is not a blanket purge of historical commercial/audit records.
- Existing local password registrations and Google sign-in retain their existing user-facing behavior; Google-created accounts are still required to complete the profile before marketplace operations.

## Verification

The change set adds or updates tests for live-session enforcement, immediate per-device and all-device revocation, session metadata non-resurrection, normalized email lookup and duplicate rejection, digest-only reset tokens, Google deletion re-authentication, and partial-session cleanup during registration.

Run in the repository environment (Node `>=22.18 <25`, pnpm `10.18.0`, installed workspace dependencies):

```bash
pnpm --filter classifieds-platform-backend type-check
pnpm --filter classifieds-platform-backend test:unit
pnpm --filter classifieds-platform-backend test:integration -- --runInBand
pnpm --filter @marketplat/mobile type-check
pnpm --filter @marketplat/mobile test
pnpm --filter @marketplat/mobile verify:workspace-unification
```

A syntax-transpilation pass is not a substitute for TypeScript type-checking or runtime/integration tests. Exercise Google OAuth callbacks, cookie/CSRF behavior, and mobile deep-link return on a staging deployment before production rollout.
