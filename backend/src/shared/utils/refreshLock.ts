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
    return result as RotateResult;
  } catch {
    return RotateResult.REDIS_ERROR;
  }
};
