// TERMUX-FIX-01: switched from native bcrypt to bcryptjs to run on
// Termux/Android with Node 24 — native bcrypt ships a prebuilt binary
// per platform/Node ABI and falls back to compiling from source via
// node-gyp when no matching binary exists; Termux's environment
// (no glibc, different toolchain) makes that native build fail, so
// bcrypt is unusable there regardless of Node version. bcryptjs is a
// pure-JS reimplementation with the identical hash() / compare() API
// and the identical hash format ($2a$/$2b$ prefixed) — existing
// password hashes in the database remain valid, no migration needed.
//
// Trade-off (kept for context): bcryptjs's "async" calls still run the
// hashing work as synchronous JS in chunks (via setImmediate) rather
// than offloading to libuv's worker thread pool the way native bcrypt
// does, so it blocks the event loop for the duration of each hash. On
// a real deployment target (Linux server, PM2 cluster mode) this is a
// meaningful cost; for Termux/Android — a single-user, single-process
// environment — it's not, and portability wins.
import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export const hashPassword = async (password: string): Promise<string> =>
  bcrypt.hash(password, SALT_ROUNDS);

export const comparePassword = async (password: string, hashed: string): Promise<boolean> =>
  bcrypt.compare(password, hashed);
