import { z } from 'zod';

/**
 * FIX OBSERVABILITY-CLIENT-ERROR-01: schema for reports coming from
 * the frontend's lib/errorReporter.ts. That function already guards
 * its own callers from throwing, but this schema is the trust boundary
 * between an unauthenticated HTTP request and our logging pipeline —
 * every field is bounded so a malicious or buggy client can't push a
 * megabyte of junk through it into Sentry's event volume.
 *
 * The payload shape mirrors exactly what the frontend already sends
 * (see reportClientError in frontend/lib/errorReporter.ts) plus the
 * three fields that only make sense server-side (ip, receivedAt,
 * serverUserAgent) which the controller attaches itself.
 */
export const clientErrorSchema = z.object({
  body: z.object({
    // Core error fields — the ones the frontend's SerializedError
    // carries over from the original Error object.
    message: z.string().min(1).max(2_000),
    stack: z.string().max(10_000).optional(),
    name: z.string().max(200).optional(),
    // Arbitrary JSON-ish metadata attached by the caller: boundary
    // name, digest, digest of the parent error, etc. Bounded by size
    // below (JSON.stringify length) rather than by shape — the whole
    // point of this field is that different call sites attach
    // different data, and a rigid schema here would force every new
    // caller to edit this file.
    context: z.record(z.unknown()).optional(),
    // Where in the browser the error happened.
    url: z.string().max(2_000).optional(),
    userAgent: z.string().max(500).optional(),
    // Client-side timestamp (informational; server uses its own too).
    timestamp: z.string().max(50).optional(),
    // Constant 'marketplace-frontend' — included so other apps
    // (admin panel, future mobile) can share the endpoint.
    service: z.string().max(100).optional(),
  }).refine(
    // Defense in depth on top of the per-field caps: the sum of the
    // parts is bounded too. 30 KB is generous for a real error event
    // and well below any request-body limit the middleware chain
    // already enforces, so this only ever rejects garbage.
    (body) => {
      try {
        return JSON.stringify(body).length <= 30_000;
      } catch {
        return false;
      }
    },
    { message: 'Payload too large' },
  ),
});

export type ClientErrorInput = z.infer<typeof clientErrorSchema>['body'];
