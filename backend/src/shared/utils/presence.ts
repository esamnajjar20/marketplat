import { redis } from '../../config/redis';

/**
 * Online/presence tracking — heartbeat pattern over Redis, same
 * "cheap ephemeral counter, not a DB column" idea as viewsBuffer.ts.
 * There's no WebSocket in this codebase (chat is polling-only, see
 * useMessages's own doc comment), so presence can't be push-driven;
 * instead the frontend calls touch() on an interval while the app is
 * open (see useHeartbeat), and a key's mere existence means "online
 * within the last PRESENCE_TTL_SECONDS" — no explicit offline write is
 * needed, the key just expires.
 */

const PRESENCE_PREFIX = 'presence:';
const LAST_SEEN_PREFIX = 'presence:last-seen:';
const LAST_SEEN_TTL_SECONDS = 30 * 24 * 60 * 60;

// Must be comfortably longer than the frontend's heartbeat interval
// (useHeartbeat polls every 45s) so a single missed beat — a slow
// request, a brief network blip — doesn't flip someone to "offline"
// and back within seconds. 90s gives two full heartbeat cycles of
// slack before the key actually expires.
const PRESENCE_TTL_SECONDS = 90;

export const presence = {
  /** Refreshes the caller's own online marker. Called by PATCH
   * /users/me/presence — never on the caller's behalf, since presence
   * is inherently self-reported (there's no way to "see" a user is
   * online except that user's own client telling us so). */
  touch: async (userId: string): Promise<void> => {
    try {
      const now = new Date().toISOString();
      await Promise.all([
        redis.setex(`${PRESENCE_PREFIX}${userId}`, PRESENCE_TTL_SECONDS, now),
        redis.setex(`${LAST_SEEN_PREFIX}${userId}`, LAST_SEEN_TTL_SECONDS, now),
      ]);
    } catch {
      // Redis unavailable — presence is a nice-to-have, never worth
      // failing the request over (same posture as viewsBuffer.increment).
    }
  },

  /** Bulk existence check — one round trip for however many user IDs
   * ChatWindow/ConversationList needs a dot for, rather than N GETs. */
  getPresence: async (userIds: string[]): Promise<Record<string, { online: boolean; lastSeenAt: string | null }>> => {
    if (userIds.length === 0) return {};
    try {
      const onlineKeys = userIds.map((id) => `${PRESENCE_PREFIX}${id}`);
      const lastSeenKeys = userIds.map((id) => `${LAST_SEEN_PREFIX}${id}`);
      const [onlineValues, lastSeenValues] = await Promise.all([
        redis.mget(...onlineKeys),
        redis.mget(...lastSeenKeys),
      ]);
      return Object.fromEntries(userIds.map((id, i) => [id, {
        online: onlineValues[i] !== null,
        lastSeenAt: lastSeenValues[i] ?? null,
      }]));
    } catch {
      return Object.fromEntries(userIds.map((id) => [id, { online: false, lastSeenAt: null }]));
    }
  },
};
