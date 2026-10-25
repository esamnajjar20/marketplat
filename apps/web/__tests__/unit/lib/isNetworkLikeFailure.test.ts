import { describe, it, expect } from 'vitest';
import { isNetworkLikeFailure } from '@/lib/isNetworkLikeFailure';
import type { ParsedError } from '@/lib/errorParser';

function p(partial: Partial<ParsedError>): ParsedError {
  return { message: 'x', statusCode: 400, ...partial };
}

describe('isNetworkLikeFailure', () => {
  it('treats queued / NETWORK_ERROR / status 0 / 502-504 / 408 as network-like', () => {
    expect(isNetworkLikeFailure(p({ queued: true, statusCode: 202 }))).toBe(true);
    expect(isNetworkLikeFailure(p({ code: 'NETWORK_ERROR', statusCode: 503 }))).toBe(true);
    expect(isNetworkLikeFailure(p({ code: 'OFFLINE_QUEUED', statusCode: 202 }))).toBe(true);
    expect(isNetworkLikeFailure(p({ statusCode: 0 }))).toBe(true);
    expect(isNetworkLikeFailure(p({ statusCode: 408 }))).toBe(true);
    expect(isNetworkLikeFailure(p({ statusCode: 502 }))).toBe(true);
    expect(isNetworkLikeFailure(p({ statusCode: 503 }))).toBe(true);
    expect(isNetworkLikeFailure(p({ statusCode: 504 }))).toBe(true);
  });

  it('does not treat validation or auth failures as network-like', () => {
    expect(isNetworkLikeFailure(p({ statusCode: 400 }))).toBe(false);
    expect(isNetworkLikeFailure(p({ statusCode: 401 }))).toBe(false);
    expect(isNetworkLikeFailure(p({ statusCode: 403 }))).toBe(false);
    expect(isNetworkLikeFailure(p({ statusCode: 409 }))).toBe(false);
    expect(isNetworkLikeFailure(p({ statusCode: 422 }))).toBe(false);
    expect(isNetworkLikeFailure(p({ statusCode: 500 }))).toBe(false);
  });
});
