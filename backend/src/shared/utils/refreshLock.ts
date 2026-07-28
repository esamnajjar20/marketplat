import { redis } from '../../config/redis';
import crypto from 'crypto';

const REFRESH_TTL = 7 * 24 * 60 * 60;

export const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export enum RotateResult {
  SUCCESS = 'SUCCESS',
  TOKEN_MISMATCH = 'TOKEN_MISMATCH',
  TOKEN_NOT_FOUND = 'TOKEN_NOT_FOUND',
  REDIS_ERROR = 'REDIS_ERROR',
}

// Lua Script — Atomic بلا Race Condition
const ROTATE_SCRIPT = `
  local key = KEYS[1]
  local expected = ARGV[1]
  local newValue = ARGV[2]
  local ttl = tonumber(ARGV[3])

  local current = redis.call('GET', key)

  if current == false then
    return 'TOKEN_NOT_FOUND'
  end

  if current ~= expected then
    return 'TOKEN_MISMATCH'
  end

  redis.call('SETEX', key, ttl, newValue)
  return 'SUCCESS'
`;

const VALID_ROTATE_RESULTS: ReadonlySet<string> = new Set([
  RotateResult.SUCCESS,
  RotateResult.TOKEN_MISMATCH,
  RotateResult.TOKEN_NOT_FOUND,
]);

export const atomicRefreshRotate = async (
  userId: string,
  sessionId: string,
  oldToken: string,
  newToken: string
): Promise<RotateResult> => {
  const key = `refresh:${userId}:${sessionId}`;
  try {
    const result = await (redis as any).eval(
      ROTATE_SCRIPT,
      1,
      key,
      hashToken(oldToken),
      hashToken(newToken),
      REFRESH_TTL.toString()
    );
    // BUGFIX (found while re-verifying this suite): previously cast
    // whatever `eval` returned straight to RotateResult with no
    // validation — if the underlying eval call ever resolved to
    // something unexpected (undefined, an unrecognized string, a
    // stale/misconfigured mock in tests, or a future Lua-script typo),
    // that value would silently flow out of this function as if it
    // were a legitimate RotateResult, masking the failure instead of
    // surfacing it. Any value outside the three real outcomes the
    // script can return is now treated as REDIS_ERROR — the same
    // "something went wrong talking to Redis" signal callers already
    // handle for an actual eval() rejection.
    if (typeof result === 'string' && VALID_ROTATE_RESULTS.has(result)) {
      return result as RotateResult;
    }
    return RotateResult.REDIS_ERROR;
  } catch {
    return RotateResult.REDIS_ERROR;
  }
};
