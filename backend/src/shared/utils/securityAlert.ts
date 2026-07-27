import { logger } from './logger';
import { prisma } from '../../config/prisma';
import { emailService } from './emailService';
import { env } from '../../config/env';

export interface SecurityAlertPayload {
  userId: string;
  sessionId?: string;
  ip?: string;
  userAgent?: string;
  event: 'TOKEN_REUSE' | 'ACCOUNT_LOCKED' | 'SUSPICIOUS_LOGIN';
  details?: Record<string, unknown>;
}

/**
 * FIX SEC-ALERT-01: previously this only logged a warning — the account
 * owner was never actually notified of a lockout or detected token
 * reuse (a real security event they'd want to know about immediately,
 * e.g. to change a compromised password). Now sends a real email via
 * emailService (which itself falls back to logging if SMTP isn't
 * configured, so this stays safe to call in any environment) and
 * optionally POSTs to a security webhook for SIEM/ops alerting.
 *
 * Looks up the user's email by userId since not every call site has it
 * directly in scope (e.g. the token-reuse-detection path only has the
 * JWT payload's userId, not an email) — keeping that lookup here means
 * call sites don't each need their own Prisma query just to notify the
 * user.
 */
export const sendSecurityAlert = async (payload: SecurityAlertPayload): Promise<void> => {
  logger.warn(`[SECURITY ALERT] ${payload.event}`, payload);

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { email: true },
    });

    if (user?.email) {
      await emailService.sendSecurityAlertEmail(user.email, payload.event, {
        ip: payload.ip,
        userAgent: payload.userAgent,
        ...payload.details,
      });
    } else {
      logger.warn('Security alert: user not found for email notification', {
        userId: payload.userId,
      });
    }
  } catch (err) {
    // A failed notification must never block the security action itself
    // (account lock / session invalidation already happened by the time
    // this runs) — log and move on.
    logger.error('Failed to send security alert email', { err, payload });
  }

  // FIX SEC-ALERT-01: optional SIEM/ops webhook — same fire-and-forget,
  // never-throw pattern as logger.ts's error reporter. Unset by default;
  // no-op if SECURITY_ALERT_WEBHOOK_URL isn't configured.
  //
  // BUGFIX (found during a post-implementation code audit): this fetch()
  // had no timeout at all — the exact same class of gap PROD-FIX-02
  // closed for Cloudinary uploads and SMTP (see config/cloudinary.ts and
  // emailService.ts's own comments for the full reasoning). Left
  // unfixed here, it was arguably worse: this path fires on every
  // TOKEN_REUSE/ACCOUNT_LOCKED event, which is exactly the kind of thing
  // that can spike during an actual attack (repeated failed logins,
  // credential stuffing) — a slow or hung webhook endpoint under that
  // exact load could accumulate an unbounded number of in-flight fetch
  // calls with nothing to ever time them out, right when the process is
  // also under the most real pressure. AbortController + a 10s bound
  // (generous for a small JSON POST, short enough to not accumulate
  // indefinitely) closes that gap the same way the other two call sites
  // already do.
  if (env.securityAlert.webhookUrl) {
    const webhookController = new AbortController();
    const webhookTimeout = setTimeout(() => webhookController.abort(), 10_000);
    // Matches the same reasoning as config/cloudinary.ts's withTimeout —
    // this timer alone must never be the thing keeping the Node process
    // alive (e.g. during graceful shutdown or a short-lived script).
    webhookTimeout.unref();

    fetch(env.securityAlert.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
      signal: webhookController.signal,
    })
      .catch(err => {
        logger.error('Failed to deliver security alert webhook', { err });
      })
      .finally(() => {
        clearTimeout(webhookTimeout);
      });
  }

  // Push notifications aren't part of this app yet (no mobile/web-push
  // infrastructure exists) — intentionally not stubbed here to avoid
  // implying a capability that doesn't exist anywhere else in the stack.
};
