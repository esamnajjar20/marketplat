import { presenceRedis as redis } from '../../config/redis';

/**
 * Online/presence tracking — heartbeat pattern over Redis, same
 * "cheap ephemeral counter, not a DB column" idea as viewsBuffer.ts.
 * There's no WebSocket in this codebase (chat is polling-only, see
 * useMessages's own doc comment), so presence can't be push-driven;
 * instead the frontend calls touch() on an interval while the app is
 * open (see PresenceHeartbeat), and a key's mere existence means "online
 * within the last PRESENCE_TTL_SECONDS" — no explicit offline write is
 * needed, the key just expires.
 */

const PRESENCE_PREFIX = 'presence:';
const LAST_SEEN_PREFIX = 'presence:last-seen:';
const LAST_SEEN_TTL_SECONDS = 30 * 24 * 60 * 60;

// The client normally refreshes this key every 120s. The 200s TTL leaves
// 80s for scheduling and network delay beyond one normal interval. A fully
// missed interval can still cause a brief offline state before the next tick;
// the client sends an immediate beat when visibility or network state resumes.
const PRESENCE_TTL_SECONDS = 200;

export const presence = {
  /** Refreshes the caller's own online marker. Called by PATCH
   * /users/me/presence — never on the caller's behalf, since presence
   * is inherently self-reported (there's no way to "see" a user is
   * online except that user's own client telling us so). */
  touch: async (userId: string): Promise<void> => {
    try {
      const now = new Date().toISOString();
      // Both keys are written to the same Redis service. Pipeline the two
      // SETEX commands so a heartbeat costs one network round trip instead
      // of two concurrent round trips, which matters on remote Redis plans.
      const pipeline = redis.pipeline();
      pipeline.setex(`${PRESENCE_PREFIX}${userId}`, PRESENCE_TTL_SECONDS, now);
      pipeline.setex(`${LAST_SEEN_PREFIX}${userId}`, LAST_SEEN_TTL_SECONDS, now);
      const results = await pipeline.exec();
      if (results?.some(([error]) => error !== null)) {
        throw new Error('Presence Redis pipeline failed');
      }
    } catch {
      // Redis unavailable — presence is a nice-to-have, never worth
      // failing the request over (same posture as viewsBuffer.increment).
    }
  },

  /** Bulk existence check — one round trip for however many user IDs
   * ChatWindow/ConversationList needs a dot for, rather than N GETs. */
  getPresence: async (
    userIds: string[]
  ): Promise<Record<string, { online: boolean; lastSeenAt: string | null }>> => {
    if (userIds.length === 0) return {};
    try {
      const onlineKeys = userIds.map(id => `${PRESENCE_PREFIX}${id}`);
      const lastSeenKeys = userIds.map(id => `${LAST_SEEN_PREFIX}${id}`);
      const [onlineValues, lastSeenValues] = await Promise.all([
        redis.mget(...onlineKeys),
        redis.mget(...lastSeenKeys),
      ]);
      return Object.fromEntries(
        userIds.map((id, i) => [
          id,
          {
            online: onlineValues[i] !== null,
            lastSeenAt: lastSeenValues[i] ?? null,
          },
        ])
      );
    } catch {
      return Object.fromEntries(userIds.map(id => [id, { online: false, lastSeenAt: null }]));
    }
  },
};
