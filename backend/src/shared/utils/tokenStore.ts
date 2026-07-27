import { redis } from '../../config/redis';
import { hashToken } from './refreshLock';

const REFRESH_PREFIX = 'refresh:';
const BLACKLIST_PREFIX = 'blacklist:';
const SESSION_ZSET_PREFIX = 'sessions_z:';
const SESSION_META_PREFIX = 'session_meta:';
const FAILED_EMAIL_PREFIX = 'failed_login_email:';
const FAILED_IP_PREFIX = 'failed_login_ip:';
const ACCOUNT_LOCKED_PREFIX = 'account_locked:';

const REFRESH_TTL = 7 * 24 * 60 * 60;
export const MAX_SESSIONS_PER_USER = 10;

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
const SAVE_SESSION_SCRIPT = `
  local zsetKey    = KEYS[1]
  local metaKey    = KEYS[2]
  local refreshKey = KEYS[3]

  local sessionId   = ARGV[1]
  local score       = tonumber(ARGV[2])
  local metaValue   = ARGV[3]
  local tokenHash   = ARGV[4]
  local ttl         = tonumber(ARGV[5])
  local maxSessions = tonumber(ARGV[6])
  local userId      = ARGV[7]

  local count = redis.call('ZCARD', zsetKey)

  if count >= maxSessions then
    local oldest = redis.call('ZRANGE', zsetKey, 0, 0)
    if #oldest > 0 then
      local oldSid = oldest[1]
      redis.call('DEL', 'session_meta:' .. userId .. ':' .. oldSid)
      redis.call('DEL', 'refresh:' .. userId .. ':' .. oldSid)
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
      userId
    );
  },

  // ── Validate ──────────────────────────────────────────
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

  // ── Update lastSeen — Throttled (5 min) ──────────────
  updateSessionLastSeen: async (userId: string, sessionId: string): Promise<void> => {
    const key = `${SESSION_META_PREFIX}${userId}:${sessionId}`;
    const throttleKey = `last_seen_throttle:${userId}:${sessionId}`;

    const recentlyUpdated = await redis.exists(throttleKey);
    if (recentlyUpdated) return;

    try {
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
    await redis.setex(getBlacklistKey(token), ttlSeconds, '1');
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
  ): Promise<{ emailAttempts: number; ipAttempts: number }> => {
    const pipeline = redis.pipeline();
    pipeline.incr(`${FAILED_EMAIL_PREFIX}${email}`);
    pipeline.expire(`${FAILED_EMAIL_PREFIX}${email}`, 15 * 60);
    pipeline.incr(`${FAILED_IP_PREFIX}${ip}`);
    pipeline.expire(`${FAILED_IP_PREFIX}${ip}`, 60 * 60);
    const results = await pipeline.exec();
    return {
      emailAttempts: (results?.[0]?.[1] as number) ?? 0,
      ipAttempts: (results?.[2]?.[1] as number) ?? 0,
    };
  },

  clearFailedLogins: async (email: string, ip: string): Promise<void> => {
    await redis.del(`${FAILED_EMAIL_PREFIX}${email}`, `${FAILED_IP_PREFIX}${ip}`);
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
};
