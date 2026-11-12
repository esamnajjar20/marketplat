import crypto from 'crypto';

/**
 * Constant-time string comparison for secrets/tokens (CSRF double-submit
 * token, metrics bearer token).
 *
 * `crypto.timingSafeEqual` requires equal-length buffers, so unequal lengths
 * are rejected up front. That early return does not leak byte-level
 * information because the true token's length is not secret.
 */
export function safeTokenEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
