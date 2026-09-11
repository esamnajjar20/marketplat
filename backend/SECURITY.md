# Security Notes

This document records deliberate security tradeoffs in this codebase —
decisions that were made consciously, with known risk, rather than
oversights. If you're reviewing this project for production readiness,
read this file alongside the code comments it references.

## Refresh token storage: `httpOnly` cookie

**Current implementation (PROD-FIX-15):** the refresh token is set by
the backend as an `httpOnly`, `Secure` cookie (see
`shared/utils/authCookies.ts`) and is never touched by client JS. The
frontend's Zustand auth store (`store/auth.store.ts`) does **not**
persist a refresh token at all — its `partialize` excludes it entirely,
along with the in-memory-only access token. Only non-sensitive `user`
display data is persisted, to avoid a blank/flashing header on reload.
On load, the frontend calls `/auth/refresh` unconditionally; the
browser attaches the httpOnly cookie automatically, and the backend
issues a fresh access token if the cookie is valid.

This document previously described an earlier design (refresh token in
`localStorage`, with CSP and rotation/reuse-detection as compensating
controls) as a deliberate tradeoff. That design was superseded by the
httpOnly-cookie approach below — the older text is kept out of this
file now that the code no longer matches it, to avoid this doc
contradicting the implementation it's meant to describe.

**Cookie attributes:** `httpOnly: true`, `secure: true`,
`sameSite: 'none'` for the refresh-token cookie (frontend and API can
sit on different origins/subdomains; `SameSite=None` requires
`Secure`). One documented exception: the `oauth_state` cookie uses
`sameSite: 'lax'` deliberately, since it only needs to survive a
same-origin OAuth redirect round-trip and doesn't need cross-site
attachment.

**What still limits the damage of a stolen refresh token** (cookie
theft via something other than XSS-reads-localStorage — e.g. a
network-level or device-level compromise):
- Refresh token rotation (`atomicRefreshRotate`, `jwt.ts`) — each use
  invalidates the previous token. A stolen-then-used token, followed by
  the legitimate user's own next refresh, triggers **reuse detection**
  (`TOKEN_REUSE` in `securityAlert.ts`), which revokes **all** sessions
  for that user and emails them a security alert.
- 7-day TTL caps the maximum exposure window even if reuse detection
  never fires.

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
