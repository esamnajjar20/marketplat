import type { AuditLogDetails } from './auditLog';

// FIX OPS-3.2: `details` is a flat object of primitives (see
// auditLog.ts's own FIX SEC-3.3 comment on AuditLogDetails), and every
// current call site across modules/ only ever passes safe identifiers
// and state (storeId, newRole, reason, ...). Nothing today puts a
// password/token/card number in there — but nothing before this
// stopped a future call site from doing so by accident either, and
// once written, an audit log row is meant to be kept and read by
// admins investigating an incident (see audit-logs.repository.ts),
// which is exactly the wrong place for a secret to leak into.
//
// This is a defense-in-depth net, not a fix for a live exploit: it
// redacts by key name so a mistake at a future call site degrades to
// "[REDACTED]" in the stored row instead of the actual secret value,
// without requiring every call site to remember to scrub its own
// input.
const SENSITIVE_KEY_PATTERN =
  /password|token|secret|apikey|api_key|card|cvv|cvc|otp|pin|ssn|ccnum/i;

const REDACTED = '[REDACTED]' as const;

export function sanitizeAuditDetails(
  details: AuditLogDetails | undefined
): AuditLogDetails | undefined {
  if (!details) return details;

  const sanitized: AuditLogDetails = {};
  for (const [key, value] of Object.entries(details)) {
    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : value;
  }
  return sanitized;
}
