import { Request } from 'express';

/**
 * getClientIp — returns the real client IP for the request.
 *
 * FIX SEC-09: auth.controller.ts was manually parsing the x-forwarded-for
 * header (.split(',')[0]) while the rest of the app used req.ip, which is
 * already correctly computed by Express's trust proxy middleware based on
 * the TRUST_PROXY value in env.ts. Manual header parsing is redundant,
 * inconsistent, and susceptible to header injection if trust proxy isn't
 * configured (because then x-forwarded-for can be spoofed by any client).
 * Using req.ip everywhere ensures the trust proxy setting is the single
 * source of truth for how many proxy hops to trust.
 */
export function getClientIp(req: Request): string {
  return req.ip || 'unknown';
}
