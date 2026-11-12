/**
 * TTL (seconds) with random jitter in [0, jitter). Spreads expiry of keys that
 * are written together so they don't all miss at once (thundering herd).
 */
export const ttlWithJitter = (baseTtlSeconds: number, jitterSeconds: number): number =>
  baseTtlSeconds + Math.floor(Math.random() * jitterSeconds);
