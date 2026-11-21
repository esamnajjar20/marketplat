/**
 * TURNSTILE-01: optional Cloudflare Turnstile verification for public sign-up.
 *
 * Disabled (no-op) unless TURNSTILE_SECRET_KEY is set, so existing deployments and
 * tests are unaffected. When enabled, requests without a valid token are rejected.
 * The `turnstileToken` body field is always removed before the request reaches
 * validation, so strict Zod schemas never see it.
 */
import type { NextFunction, Request, Response } from 'express';
import { sendApiError } from '../shared/errors/errorResponse';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileFetch = typeof fetch;

export function createTurnstileMiddleware(
  getSecret: () => string | undefined = () => process.env.TURNSTILE_SECRET_KEY,
  fetchImpl: TurnstileFetch = (...args) => fetch(...args),
) {
  return async function verifyTurnstile(req: Request, res: Response, next: NextFunction): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const token = typeof body.turnstileToken === 'string' ? body.turnstileToken : '';
    delete body.turnstileToken;

    const secret = getSecret();
    if (!secret) {
      next();
      return;
    }

    if (!token) {
      sendApiError(req, res, 400, 'CAPTCHA_REQUIRED', 'Verification is required');
      return;
    }

    try {
      const form = new URLSearchParams({ secret, response: token });
      if (req.ip) form.set('remoteip', req.ip);
      const result = await fetchImpl(VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(5000),
      });
      const data = (await result.json()) as { success?: boolean };
      if (data.success === true) {
        next();
        return;
      }
      sendApiError(req, res, 400, 'CAPTCHA_FAILED', 'Verification failed');
    } catch {
      // Fail closed: if the verifier is unreachable we cannot confirm the visitor.
      sendApiError(req, res, 503, 'CAPTCHA_UNAVAILABLE', 'Verification is temporarily unavailable');
    }
  };
}

export const verifyTurnstile = createTurnstileMiddleware();
