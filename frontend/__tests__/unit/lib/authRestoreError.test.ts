/**
 * REGRESSION (FIX AUTH-RESTORE-ERRSHAPE-01): apiClient rejects with a ParsedError
 * ({ statusCode, ... }), never an AxiosError, so session-rejection checks must read
 * statusCode. Only 401/403 are definitive; transient failures must not log out.
 */
import { describe, it, expect } from 'vitest';
import { getHttpStatus, isDefiniteSessionRejection } from '@/lib/authRestoreError';

describe('isDefiniteSessionRejection', () => {
  it('treats a ParsedError 401/403 (the real apiClient rejection shape) as a rejection', () => {
    expect(isDefiniteSessionRejection({ message: 'x', statusCode: 401 })).toBe(true);
    expect(isDefiniteSessionRejection({ message: 'x', statusCode: 403 })).toBe(true);
  });

  it('still understands an AxiosError-like { response.status } shape', () => {
    expect(isDefiniteSessionRejection({ response: { status: 401 } })).toBe(true);
  });

  it('does NOT treat transient failures as a rejection (no logout on cold start / deploy)', () => {
    for (const statusCode of [408, 429, 500, 502, 503, 504]) {
      expect(isDefiniteSessionRejection({ message: 'x', statusCode })).toBe(false);
    }
    expect(isDefiniteSessionRejection({ response: { status: 503 } })).toBe(false);
  });

  it('does NOT treat network failures / aborts / junk as a rejection', () => {
    expect(isDefiniteSessionRejection(new Error('Network Error'))).toBe(false);
    expect(isDefiniteSessionRejection({ message: 'x', statusCode: 0 })).toBe(false);
    expect(isDefiniteSessionRejection(null)).toBe(false);
    expect(isDefiniteSessionRejection(undefined)).toBe(false);
    expect(isDefiniteSessionRejection('401')).toBe(false);
  });

  it('getHttpStatus prefers statusCode and falls back to response.status', () => {
    expect(getHttpStatus({ statusCode: 500, response: { status: 401 } })).toBe(500);
    expect(getHttpStatus({ response: { status: 404 } })).toBe(404);
    expect(getHttpStatus({})).toBe(0);
  });
});
