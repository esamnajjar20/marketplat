// TERMUX-FIX-01 (original constraint, still true): native bcrypt ships
// a prebuilt binary per platform/Node ABI and falls back to compiling
// from source via node-gyp when no matching binary exists; Termux's
// environment (no glibc, different toolchain) makes that native build
// fail, so bcrypt is unusable there regardless of Node version.
// bcryptjs is a pure-JS reimplementation with the identical hash() /
// compare() API and the identical hash format ($2a$/$2b$ prefixed) —
// existing password hashes in the database remain valid either way,
// no migration needed, and the two are interchangeable per-call (a
// hash created by one verifies fine with the other).
//
// FIX M-020: bcryptjs's "async" calls still run the hashing work as
// synchronous JS in chunks (via setImmediate) rather than offloading
// to libuv's worker thread pool the way native bcrypt does — it
// blocks the event loop for the duration of each hash
// (SALT_ROUNDS=12), which delays every other in-flight request on the
// same process under load. That cost is real on a standard Linux
// deployment target (PM2 cluster mode, many concurrent users) but
// irrelevant on Termux/Android (single-user, single-process).
//
// Rather than force one trade-off on every environment, `bcrypt` is
// now an *optional* dependency (see package.json): npm installs it
// opportunistically where its prebuilt binary is available (any
// standard Linux/macOS/Windows target) and simply skips it without
// failing the install where it isn't (Termux). At startup this module
// tries to require() the native module and uses it if present,
// falling back to bcryptjs automatically otherwise — no env var or
// manual config needed, and Termux continues to work exactly as
// before with zero behavior change there.
import bcryptjs from 'bcryptjs';
import { logger } from './logger';

const SALT_ROUNDS = 12;

interface BcryptLike {
  hash(data: string, saltRounds: number): Promise<string>;
  compare(data: string, encrypted: string): Promise<boolean>;
}

function loadBcryptImpl(): { impl: BcryptLike; isNative: boolean } {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const native = require('bcrypt') as BcryptLike;
    logger.info('Using native bcrypt for password hashing (worker-thread offload, event loop not blocked)');
    return { impl: native, isNative: true };
  } catch {
    // Expected on Termux/Android (no prebuilt binary, native build
    // fails) or any environment where the optional dependency simply
    // wasn't installed — not an error, just the documented fallback.
    logger.info('Native bcrypt not available — falling back to bcryptjs (pure JS, blocks event loop per hash)');
    return { impl: bcryptjs, isNative: false };
  }
}

const { impl: bcrypt } = loadBcryptImpl();

export const hashPassword = async (password: string): Promise<string> =>
  bcrypt.hash(password, SALT_ROUNDS);

export const comparePassword = async (password: string, hashed: string): Promise<boolean> =>
  bcrypt.compare(password, hashed);

/**
 * FIX LOGIN-TIMING-01: always run a bcrypt compare, even when `hashed`
 * is missing (nonexistent user, or a Google-only account with no local
 * password). On those paths, a fixed "dummy" hash of the same
 * SALT_ROUNDS cost is compared instead, and the boolean result is
 * discarded — what matters is that the same ~SALT_ROUNDS worth of CPU
 * time gets spent, identically to a real wrong-password attempt.
 * Without this, an unauthenticated caller could distinguish "no such
 * email" (returns in ~5ms) from "email exists, password wrong"
 * (returns after ~250ms of bcrypt). That delta is a reliable email-
 * enumeration oracle: an attacker submits candidate emails and, by
 * measuring response time alone, learns which ones are registered —
 * CWE-208 (Observable Timing Discrepancy).
 *
 * The dummy hash is generated lazily on first miss and cached for the
 * process lifetime, so the one-time ~250ms cost is paid at most once
 * per cold start and only if someone actually hits the no-user path.
 */
let dummyTimingHashPromise: Promise<string> | null = null;

export async function comparePasswordOrDummy(
  password: string,
  hashed: string | null | undefined,
): Promise<boolean> {
  if (hashed) {
    return bcrypt.compare(password, hashed);
  }
  if (!dummyTimingHashPromise) {
    dummyTimingHashPromise = bcrypt.hash(
      'dummy-timing-constant-never-matches-any-real-password',
      SALT_ROUNDS,
    );
  }
  const dummy = await dummyTimingHashPromise;
  await bcrypt.compare(password, dummy);
  return false;
}
