# Security Notes

This document records deliberate security tradeoffs in this codebase —
decisions that were made consciously, with known risk, rather than
oversights. If you're reviewing this project for production readiness,
read this file alongside the code comments it references.

## Refresh token storage: `localStorage`

**Decision:** the refresh token is persisted to `localStorage` (see
`store/auth.store.ts`'s `partialize`). The access token is **not**
persisted — it lives only in memory and is re-issued via the refresh
token on every page load.

**Risk:** any successful XSS in this application can read `localStorage`
and exfiltrate the refresh token, giving an attacker a way to mint new
access tokens for up to the refresh token's lifetime (7 days) without
needing the user's password.

**Why this tradeoff was accepted instead of `httpOnly` cookies:**
- An `httpOnly` cookie can't be read by JS at all, which is strictly
  safer against XSS token theft — but it also can't be attached to
  cross-origin API requests as easily without `SameSite=None` (which
  has its own CSRF implications) when the frontend and API are on
  different origins/subdomains in some deployment topologies.
- This project's actual mitigation against XSS is **CSP** — see
  `middleware.ts`'s per-request nonce, which removes `'unsafe-inline'`
  from `script-src` in production. A successful XSS attack already
  requires bypassing that CSP; if an attacker can run arbitrary script
  despite the nonce-based CSP, they could also act on the user's behalf
  directly through the page's own authenticated `fetch` calls without
  needing to steal the token at all — so the marginal risk added by
  `localStorage` specifically, *given the CSP is intact*, is smaller
  than it looks in isolation.

**What actually limits the damage if this risk materializes:**
- Refresh token rotation (`atomicRefreshRotate`, `jwt.ts`) — each use
  invalidates the previous token. A stolen-then-used token by an
  attacker, followed by the legitimate user's own next refresh, triggers
  **reuse detection** (`TOKEN_REUSE` in `securityAlert.ts`), which
  revokes **all** sessions for that user and emails them a security
  alert.
- 7-day TTL caps the maximum exposure window even if reuse detection is
  never triggered (e.g., attacker never lets the legitimate token rotate
  again, just keeps re-using the stolen one within its validity window —
  this is the actual remaining residual risk: as long as only the
  attacker uses the stolen token and the legitimate user doesn't
  independently refresh, no reuse signal fires).

**If you need a stronger guarantee than this** (e.g., handling more
sensitive data than a classifieds marketplace, or operating under a
compliance regime that disallows token-in-localStorage outright), the
correct fix is moving the refresh token to an `httpOnly`, `Secure`,
`SameSite=Strict` cookie and adapting the silent-refresh flow in
`api/client.ts` accordingly — this is a real architecture change, not a
one-line fix, which is why it wasn't done as part of this audit pass.

## Password reset tokens: `crypto.randomUUID()`

`auth.service.ts`'s `forgotPassword` uses `crypto.randomUUID()` (UUID v4,
122 bits of entropy) rather than `crypto.randomBytes(32).toString('hex')`
(256 bits). 122 bits is not practically brute-forceable (the rate limiter
on `/auth/forgot-password` — 3 requests/hour — makes online guessing
irrelevant regardless), but `randomBytes(32)` is the more conventional
choice specifically for reset tokens in security-compliance checklists
(e.g., some SOC2/PCI auditors flag UUIDs here even when the underlying
entropy is fine). Not changed in this pass since the practical risk is
effectively zero, but noted here for any future compliance review.

## `forgotPassword` does not revoke existing sessions

This is intentional — see the comment directly above
`auth.service.ts`'s `forgotPassword` for the full reasoning. In short:
revoking sessions at the *request* stage (before the password has
actually been changed) would let anyone who knows a victim's email
address force-logout their active session with no proof of account
ownership — a trivial denial-of-service. `resetPassword` (after the
token is actually redeemed) is the correct point where sessions are
revoked, and it already does this.
