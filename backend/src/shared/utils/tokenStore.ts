import { redis } from '../../config/redis';
import { hashToken } from './refreshLock';
import { logger } from './logger';
import type Redis from 'ioredis';

const REFRESH_PREFIX = 'refresh:';
const BLACKLIST_PREFIX = 'blacklist:';
const SESSION_ZSET_PREFIX = 'sessions_z:';
const SESSION_META_PREFIX = 'session_meta:';
const FAILED_EMAIL_PREFIX = 'failed_login_email:';
const FAILED_IP_PREFIX = 'failed_login_ip:';
// FIX IP-NAT-SMART-COUNTER: a per-IP Set of the distinct email
// addresses that have failed login from that IP in the current
// 1-hour window. This is the signal the plain counter cannot give:
// a single user fumbling their own password drives ipAttempts up
// without growing this Set, while credential stuffing against many
// victims grows it very fast. See auth.service.ts's login() for how
// the two are combined into a lockout decision that survives Gaza's
// carrier-grade NAT (hundreds of legit users behind one IPv4) without
// letting spray through.
const FAILED_IP_EMAILS_PREFIX = 'failed_login_ips:';
const ACCOUNT_LOCKED_PREFIX = 'account_locked:';
// Cross-worker blacklist invalidation channel — see the
// "Cross-worker blacklist L1 invalidation" block below.
const INVALIDATION_CHANNEL = 'blacklist:invalidate';

const REFRESH_TTL = 7 * 24 * 60 * 60;
export const MAX_SESSIONS_PER_USER = 10;

const _lastSeenLocal = new Map<string, number>();

/**
 * BUGFIX (found during a post-implementation code audit): previously
 * `auth.middleware.ts` reimplemented this exact key construction
 * (`BLACKLIST_PREFIX + hashToken(token)`) locally, as its own private
 * constant + import of hashToken, rather than deriving it from here —
 * because the *actual* blacklist check in production always needed to
 * run as part of a single batched Redis pipeline alongside the user-cache
 * lookup (see that file's own "P-02: batch both Redis reads into one
 * pipeline round-trip" comment), and this module's own isBlacklisted()
 * (below this) only ever did a single standalone `redis.get()` — a
 * genuinely different shape, not a drop-in replacement. That left two
 * independent, silently-divergable implementations of "how do you build
 * a blacklist key" in the codebase, and isBlacklisted() itself ended up
 * entirely unused outside its own module (confirmed via a full-repo
 * search) — effectively dead code that looked tested/relied-upon but
 * wasn't. Exporting just the key-construction piece here lets
 * auth.middleware.ts build the correct pipeline key without duplicating
 * the prefix/hashing logic — single source of truth for the key, while
 * each caller still owns how it actually issues the Redis command(s).
 */
export const getBlacklistKey = (token: string): string => `${BLACKLIST_PREFIX}${hashToken(token)}`;

const BL_L1 = new Map<string, { blacklisted: boolean; exp: number }>();
const BL_L1_NEG_MS = 20_000;
const BL_L1_POS_MS = 60_000;

export function peekBlacklistL1(token: string): boolean | undefined {
  const key = getBlacklistKey(token);
  const e = BL_L1.get(key);
  if (!e) return undefined;
  if (Date.now() > e.exp) {
    BL_L1.delete(key);
    return undefined;
  }
  // LRU touch — see userCache.ts's identical l1Get for why
  // re-inserting on read matters for the FIFO bound in
  // rememberBlacklistL1 below.
  BL_L1.delete(key);
  BL_L1.set(key, e);
  return e.blacklisted;
}

export function rememberBlacklistL1(token: string, blacklisted: boolean): void {
  const key = getBlacklistKey(token);
  BL_L1.set(key, {
    blacklisted,
    exp: Date.now() + (blacklisted ? BL_L1_POS_MS : BL_L1_NEG_MS),
  });
  if (BL_L1.size > 10_000) {
    const first = BL_L1.keys().next().value;
    if (first) BL_L1.delete(first);
  }
}

// Cross-worker blacklist L1 invalidation
//
// Same PM2-cluster reasoning as userCache.ts's "Cross-worker L1
// invalidation" block, but a stronger security impact: BL_L1 holds a
// per-token boolean ("is this access token revoked?") that
// auth.middleware.ts trusts as a fast path BEFORE it ever hits Redis.
//
// A user logs out on worker A: blacklistAccessToken() writes the
// Redis key + remembers BL_L1[token]=true on A only. Every OTHER
// worker keeps serving BL_L1[token]=false (its previously-cached
// negative answer, TTL 20s) — during that window a stolen copy of
// the just-revoked token still authenticates on those workers.
// Pub/sub closes it: blacklistAccessToken() publishes the blacklist
// key, every worker's subscriber runs BL_L1.delete(key) so the next
// auth attempt on that worker re-reads Redis and sees the blacklist.
//
// Eager init from server.ts (not lazy) for the same reason as
// userCache: a worker that has already cached the negative answer
// must be subscribed BEFORE any invalidation is published, or it
// misses it silently.

let subscriber: Redis | null = null;
let subscriberReady: Promise<void> | null = null;

export function initBlacklistInvalidationSubscriber(): void {
  if (subscriberReady) return;
  subscriberReady = (async () => {
    try {
      subscriber = redis.duplicate();
      subscriber.on('error', (err) => {
        logger.warn('blacklist invalidation subscriber error', { err });
      });
      if (subscriber.status === 'wait') {
        await subscriber.connect();
      }
      await subscriber.subscribe(INVALIDATION_CHANNEL);
      subscriber.on('message', (channel, message) => {
        if (channel !== INVALIDATION_CHANNEL) return;
        // The published message is the FULL blacklist key
        // (getBlacklistKey(token) — "blacklist:<hash>"), so the
        // subscriber can delete BL_L1's entry directly without
        // re-hashing the token.
        if (message) BL_L1.delete(message);
      });
      logger.info('blacklist invalidation subscriber ready');
    } catch (err) {
      logger.warn(
        'blacklist invalidation subscriber unavailable — L1 will only be cleared on the worker handling the invalidation',
        { err },
      );
      subscriber = null;
    }
  })();
}

export function stopBlacklistInvalidationSubscriber(): void {
  const s = subscriber;
  subscriber = null;
  subscriberReady = null;
  if (s) {
    try {
      void s.quit();
    } catch {
      /* ignore */
    }
  }
}


// IP Masking — GDPR friendly
export const maskIp = (ip: string): string => {
  if (ip === 'unknown') return ip;
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.${parts[2]}.xxx`;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    return `${parts.slice(0, 4).join(':')}:xxxx:xxxx:xxxx:xxxx`;
  }
  return ip;
};

// ── Lua Script — Atomic MAX_SESSIONS ─────────────────────
// Fix 1+2: فحص العدد + حذف الأقدم + إضافة الجديد في عملية واحدة
// يستخدم Sorted Set حيث score = timestamp الإنشاء
// T600 — prefixes arrive as ARGV (same pattern as
// DELETE_ALL_SESSIONS_SCRIPT below) rather than being hardcoded here.
// Previously the eviction branch built keys as literal strings
// ('session_meta:' .. userId .. ':' .. oldSid and 'refresh:' ...) —
// diverging from the JS-side SESSION_META_PREFIX / REFRESH_PREFIX
// constants that everything else in this file uses. If either constant
// ever changed (e.g. a naming reorganization), the eviction would
// silently target non-existent keys: the oldest session's meta/refresh
// rows would survive, MAX_SESSIONS_PER_USER would be exceeded without
// any error, and the state would diverge from what getAllSessions
// reads. Passing the prefixes in keeps the constants authoritative.
const SAVE_SESSION_SCRIPT = `
  local zsetKey    = KEYS[1]
  local metaKey    = KEYS[2]
  local refreshKey = KEYS[3]

  local sessionId      = ARGV[1]
  local score          = tonumber(ARGV[2])
  local metaValue      = ARGV[3]
  local tokenHash      = ARGV[4]
  local ttl            = tonumber(ARGV[5])
  local maxSessions    = tonumber(ARGV[6])
  local userId         = ARGV[7]
  local refreshPrefix  = ARGV[8]
  local metaPrefix     = ARGV[9]

  local count = redis.call('ZCARD', zsetKey)

  if count >= maxSessions then
    local oldest = redis.call('ZRANGE', zsetKey, 0, 0)
    if #oldest > 0 then
      local oldSid = oldest[1]
      redis.call('DEL', metaPrefix .. userId .. ':' .. oldSid)
      redis.call('DEL', refreshPrefix .. userId .. ':' .. oldSid)
      redis.call('ZREM', zsetKey, oldSid)
    end
  end

  redis.call('ZADD', zsetKey, score, sessionId)
  redis.call('EXPIRE', zsetKey, ttl)
  redis.call('SETEX', metaKey, ttl, metaValue)
  redis.call('SETEX', refreshKey, ttl, tokenHash)

  return 'OK'
`;

// FIX AUDIT-V3-07: see the comment above deleteAllRefreshTokens below
// for the full reasoning — this script makes "list this user's
// sessions and delete every one of them" atomic, so a session created
// concurrently with the call can't survive it.
const DELETE_ALL_SESSIONS_SCRIPT = `
  local zsetKey = KEYS[1]
  local userId = ARGV[1]
  local refreshPrefix = ARGV[2]
  local metaPrefix = ARGV[3]

  local sessionIds = redis.call('ZRANGE', zsetKey, 0, -1)
  for _, sid in ipairs(sessionIds) do
    redis.call('DEL', refreshPrefix .. userId .. ':' .. sid)
    redis.call('DEL', metaPrefix .. userId .. ':' .. sid)
  end
  redis.call('DEL', zsetKey)

  return #sessionIds
`;

export interface SessionMetadata {
  userAgent: string;
  ip: string;
  createdAt: string;
  lastSeen: string;
}

export interface SessionInfo extends SessionMetadata {
  sessionId: string;
  isCurrent: boolean;
}

export const tokenStore = {
  // ── Save Session — Atomic ─────────────────────────────
  saveRefreshToken: async (
    userId: string,
    sessionId: string,
    token: string,
    metadata: SessionMetadata & { rawIp: string }
  ): Promise<void> => {
    const zsetKey = `${SESSION_ZSET_PREFIX}${userId}`;
    const metaKey = `${SESSION_META_PREFIX}${userId}:${sessionId}`;
    const refreshKey = `${REFRESH_PREFIX}${userId}:${sessionId}`;
    const score = Date.now();

    const safeMetadata: SessionMetadata = {
      userAgent: metadata.userAgent,
      ip: maskIp(metadata.rawIp),
      createdAt: metadata.createdAt,
      lastSeen: metadata.lastSeen,
    };

    await (redis as any).eval(
      SAVE_SESSION_SCRIPT,
      3,
      zsetKey,
      metaKey,
      refreshKey,
      sessionId,
      score.toString(),
      JSON.stringify(safeMetadata),
      hashToken(token),
      REFRESH_TTL.toString(),
      MAX_SESSIONS_PER_USER.toString(),
      userId,
      // T600 — same two prefixes every other key construction in this
      // file uses, passed explicitly so the Lua script can never drift
      // from the JS constants.
      REFRESH_PREFIX,
      SESSION_META_PREFIX
    );
  },

  // ── Validate (TEST-ONLY — not on the production refresh path) ──
  // The real refresh-token validation happens inside refreshLock.ts's
  // atomicRefreshRotate(), which performs the compare-and-swap against
  // the stored hash as part of the same Redis transaction that issues
  // the new token — a standalone read-then-compare here would be both
  // redundant and racy. This method exists for unit tests that need to
  // assert "the token for (userId, sessionId) is X" after running some
  // other tokenStore operation; see tests/unit/tokenStore.test.ts for
  // every call site. Kept exported rather than inlined into the test
  // file because it is a natural companion to saveRefreshToken and
  // removing it would force the tests to reimplement the exact key
  // shape (REFRESH_PREFIX + userId + ':' + sessionId) that lives here.
  validateRefreshToken: async (
    userId: string,
    sessionId: string,
    token: string
  ): Promise<boolean> => {
    const stored = await redis.get(`${REFRESH_PREFIX}${userId}:${sessionId}`);
    if (!stored) return false;
    return stored === hashToken(token);
  },

  // ── Delete Single Session ─────────────────────────────
  deleteRefreshToken: async (userId: string, sessionId: string): Promise<void> => {
    const pipeline = redis.pipeline();
    pipeline.del(`${REFRESH_PREFIX}${userId}:${sessionId}`);
    pipeline.del(`${SESSION_META_PREFIX}${userId}:${sessionId}`);
    pipeline.zrem(`${SESSION_ZSET_PREFIX}${userId}`, sessionId);
    await pipeline.exec();
  },

  // ── Delete All Sessions (atomic — FIX AUDIT-V3-07, see
  //    DELETE_ALL_SESSIONS_SCRIPT above for the race this fixes) ──
  deleteAllRefreshTokens: async (userId: string): Promise<void> => {
    const zsetKey = `${SESSION_ZSET_PREFIX}${userId}`;
    await (redis as any).eval(
      DELETE_ALL_SESSIONS_SCRIPT,
      1,
      zsetKey,
      userId,
      REFRESH_PREFIX,
      SESSION_META_PREFIX,
    );
  },

  // ── Extend TTL after Refresh ──────────────────────────
  extendSession: async (userId: string, sessionId: string): Promise<void> => {
    const pipeline = redis.pipeline();
    pipeline.expire(`${REFRESH_PREFIX}${userId}:${sessionId}`, REFRESH_TTL);
    pipeline.expire(`${SESSION_META_PREFIX}${userId}:${sessionId}`, REFRESH_TTL);
    pipeline.expire(`${SESSION_ZSET_PREFIX}${userId}`, REFRESH_TTL);
    await pipeline.exec();
  },

  // ── Get Session Metadata ──────────────────────────────
  getSessionMetadata: async (
    userId: string,
    sessionId: string
  ): Promise<SessionMetadata | null> => {
    try {
      const data = await redis.get(`${SESSION_META_PREFIX}${userId}:${sessionId}`);
      return data ? (JSON.parse(data) as SessionMetadata) : null;
    } catch {
      return null;
    }
  },

  // ── Update lastSeen — Throttled (5 min) + local first ─
  updateSessionLastSeen: async (userId: string, sessionId: string): Promise<void> => {
    const localKey = `${userId}:${sessionId}`;
    const now = Date.now();
    const localExp = _lastSeenLocal.get(localKey);
    if (localExp && now < localExp) return;

    const key = `${SESSION_META_PREFIX}${userId}:${sessionId}`;
    const throttleKey = `last_seen_throttle:${userId}:${sessionId}`;

    try {
      const recentlyUpdated = await redis.exists(throttleKey);
      if (recentlyUpdated) {
        _lastSeenLocal.set(localKey, now + 5 * 60 * 1000);
        return;
      }

      const data = await redis.get(key);
      if (!data) return;

      const meta = JSON.parse(data) as SessionMetadata;
      meta.lastSeen = new Date().toISOString();

      const ttl = await redis.ttl(key);
      if (ttl > 0) {
        const pipeline = redis.pipeline();
        pipeline.setex(key, ttl, JSON.stringify(meta));
        pipeline.setex(throttleKey, 5 * 60, '1');
        await pipeline.exec();
      }
      _lastSeenLocal.set(localKey, now + 5 * 60 * 1000);
      if (_lastSeenLocal.size > 5_000) {
        const first = _lastSeenLocal.keys().next().value;
        if (first) _lastSeenLocal.delete(first);
      }
    } catch {
      // silent fail — lastSeen غير حرج
    }
  },

  // ── Get All Sessions (Sorted Set — Fix 7) ─────────────
  getAllSessions: async (userId: string, currentSessionId?: string): Promise<SessionInfo[]> => {
    const sessionIds = await redis.zrange(`${SESSION_ZSET_PREFIX}${userId}`, 0, -1);
    if (sessionIds.length === 0) return [];

    // P-05: replaced N sequential GET calls with a single mget round-trip
    const keys = sessionIds.map(sid => `${SESSION_META_PREFIX}${userId}:${sid}`);
    const values = await redis.mget(...keys);

    return sessionIds.reduce<SessionInfo[]>((acc, sessionId, i) => {
      const raw = values[i];
      if (!raw) return acc; // session expired or missing
      try {
        const meta = JSON.parse(raw) as SessionMetadata;
        acc.push({ sessionId, ...meta, isCurrent: sessionId === currentSessionId });
      } catch {
        // malformed JSON — skip this session
      }
      return acc;
    }, []);
  },

  // ── Blacklist — strictMode configurable ───────────────
  blacklistAccessToken: async (token: string, ttlSeconds: number): Promise<void> => {
    if (ttlSeconds <= 0) return;
    const key = getBlacklistKey(token);
    await redis.setex(key, ttlSeconds, '1');
    rememberBlacklistL1(token, true);
    // Fan out so OTHER workers drop their BL_L1 entry immediately —
    // otherwise they keep serving this now-revoked token from their
    // own 20s negative cache. Publish failure is non-fatal: the
    // revocation is already durable in Redis, and the next auth
    // attempt on any worker will re-read it once its L1 entry expires.
    try {
      await redis.publish(INVALIDATION_CHANNEL, key);
    } catch (err) {
      logger.warn('blacklist invalidation publish failed', { err });
    }
  },

  // BUGFIX: isBlacklisted() previously lived here as a standalone
  // check (single redis.get() + its own strictMode handling), but was
  // never actually called anywhere in the codebase — the real
  // blacklist check in production always ran inline inside
  // auth.middleware.ts's own batched Redis pipeline (for the P-02
  // performance reason described in getBlacklistKey's comment above),
  // duplicating this function's logic rather than calling it. Removed
  // as dead code rather than kept "just in case" — see
  // getBlacklistKey (this file) for the shared key-construction piece
  // both call sites now use, and auth.middleware.ts for the actual
  // strictMode-aware check against a batched pipeline result.

  // ── Account Lockout (Email Hard Lock + IP Rate Limit) ─
  incrementFailedLogins: async (
    email: string,
    ip: string
  ): Promise<{ emailAttempts: number; ipAttempts: number; ipDistinctEmails: number }> => {
    const pipeline = redis.pipeline();
    // Email-scoped counter (15-min window; this is what MAX_EMAIL_ATTEMPTS locks on).
    pipeline.incr(`${FAILED_EMAIL_PREFIX}${email}`);
    pipeline.expire(`${FAILED_EMAIL_PREFIX}${email}`, 15 * 60);
    // IP-scoped total attempts counter (1-hour window).
    pipeline.incr(`${FAILED_IP_PREFIX}${ip}`);
    pipeline.expire(`${FAILED_IP_PREFIX}${ip}`, 60 * 60);
    // FIX IP-NAT-SMART-COUNTER: add this email to the per-IP Set of
    // distinct failed addresses, then read the current cardinality.
    // The Set is the spray signature — a legit user failing on their
    // own account grows the counter but not the Set.
    pipeline.sadd(`${FAILED_IP_EMAILS_PREFIX}${ip}`, email);
    pipeline.expire(`${FAILED_IP_EMAILS_PREFIX}${ip}`, 60 * 60);
    pipeline.scard(`${FAILED_IP_EMAILS_PREFIX}${ip}`);
    const results = await pipeline.exec();
    // T601 — surface command-level errors (WRONGTYPE on a clobbered
    // key, OOM, READONLY) rather than treating them as "0 attempts".
    // pipeline.exec() only rejects on transport failure; per-command
    // failures resolve as [err, null]. Reading only the value slot
    // turns a command error into a false "0 failures" — which, on the
    // login-lockout path, would silently disable the lockout while
    // Redis misbehaves. Same shape as T553's fix in auth.middleware.
    //
    // Behavior on error: log warn and return 0 counts (fail-open, same
    // posture as auth.middleware's Redis-down + BLACKLIST_STRICT=false
    // path). The alternative — throwing — would break every login on a
    // transient Redis glitch, which is worse than briefly losing the
    // counter. The visibility from the log is what matters: a real
    // pattern of these warnings is an incident signal.
    const cmdErr = results?.find(r => r?.[0])?.[0];
    if (cmdErr) {
      logger.warn('incrementFailedLogins: pipeline command error', { err: cmdErr });
      return { emailAttempts: 0, ipAttempts: 0, ipDistinctEmails: 0 };
    }
    return {
      emailAttempts: (results?.[0]?.[1] as number) ?? 0,
      ipAttempts: (results?.[2]?.[1] as number) ?? 0,
      ipDistinctEmails: (results?.[5]?.[1] as number) ?? 0,
    };
  },

  // FIX M-027: this runs right after a successful login, to clear the
  // failed-attempt counters. Previously an unhandled Redis error here
  // (transient connection blip) would propagate and fail the login
  // response despite credentials having already been verified — and
  // worse, would leave the failed_login/* keys un-cleared, so old failed
  // attempts could contribute to a later false lockout. Best-effort +
  // warn log: a successful login must not fail because of this cleanup
  // step, and a stale counter is a much smaller problem than blocking
  // login outright.
  //
  // FIX IP-NAT-SMART-COUNTER: this deliberately does NOT delete the
  // FAILED_IP_EMAILS Set. The Set is the spray signature; if it were
  // cleared on any successful login, an attacker with one valid
  // account could reset their own spray counter every time they
  // topped it up — the entire point of tracking distinct addresses
  // would be lost. The Set ages out on its own 1-hour TTL. The
  // counter (FAILED_IP_PREFIX) is still cleared, which is what makes
  // this whole scheme survive a busy NAT tower: a single legit login
  // from that tower resets the counter, so the 500-attempt ceiling is
  // never approached by ordinary user churn.
  clearFailedLogins: async (email: string, ip: string): Promise<void> => {
    try {
      await redis.del(`${FAILED_EMAIL_PREFIX}${email}`, `${FAILED_IP_PREFIX}${ip}`);
    } catch (err) {
      logger.warn('Failed to clear failed-login counters after successful login', {
        email,
        ip,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  lockAccount: async (email: string, ttlSeconds: number): Promise<void> => {
    await redis.setex(`${ACCOUNT_LOCKED_PREFIX}${email}`, ttlSeconds, '1');
  },

  isAccountLocked: async (email: string): Promise<boolean> => {
    const result = await redis.get(`${ACCOUNT_LOCKED_PREFIX}${email}`);
    return result !== null;
  },

  getIpAttempts: async (ip: string): Promise<number> => {
    const val = await redis.get(`${FAILED_IP_PREFIX}${ip}`);
    return val ? parseInt(val) : 0;
  },

  // FIX IP-NAT-SMART-COUNTER: companion to getIpAttempts. Returns the
  // number of distinct email addresses that have failed login from
  // this IP in the current 1-hour window. auth.service.ts's login()
  // reads this and getIpAttempts together to distinguish a busy NAT
  // tower (high attempts, low distinct-email count) from a spray
  // (high attempts, high distinct-email count). Both reads batched
  // into one round-trip to keep the login path's Redis cost flat.
  getIpStats: async (
    ip: string
  ): Promise<{ attempts: number; distinctEmails: number }> => {
    const pipeline = redis.pipeline();
    pipeline.get(`${FAILED_IP_PREFIX}${ip}`);
    pipeline.scard(`${FAILED_IP_EMAILS_PREFIX}${ip}`);
    const results = await pipeline.exec();
    // T602 — same pattern as T601 above. A command-level error here
    // would otherwise read as "0 attempts, 0 distinct emails", which
    // auth.service's NAT-vs-spray heuristic would interpret as "no
    // suspicious activity" rather than "couldn't tell".
    const cmdErr = results?.find(r => r?.[0])?.[0];
    if (cmdErr) {
      logger.warn('getIpStats: pipeline command error', { err: cmdErr });
      return { attempts: 0, distinctEmails: 0 };
    }
    const attemptsRaw = results?.[0]?.[1];
    return {
      attempts: attemptsRaw ? parseInt(String(attemptsRaw), 10) : 0,
      distinctEmails: (results?.[1]?.[1] as number) ?? 0,
    };
  },
};
