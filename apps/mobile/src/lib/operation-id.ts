import * as Crypto from 'expo-crypto';

/**
 * Random hex token from the platform CSPRNG (expo-crypto). Falls back to Math.random only if the native
 * module is unavailable. Operation ids are idempotency keys, NOT a security boundary: server-side owner
 * checks on replay are what protect other users' records. Strong randomness just makes collisions and
 * guessing impractical.
 */
export function secureRandomToken(byteLength = 8): string {
  try {
    const bytes = Crypto.getRandomBytes(byteLength);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return Math.random().toString(36).slice(2, 2 + byteLength + 2);
  }
}

/** Create a backend-compatible idempotency key for one user intent. */
export function createMobileOperationId(prefix: string): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 24) || 'mobile';
  return `${safePrefix}-${Date.now()}-${secureRandomToken(8)}`;
}
