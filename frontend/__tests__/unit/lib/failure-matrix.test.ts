import { describe, expect, it } from 'vitest';
import { parseApiError } from '@/lib/errorParser';
import { isRetryableHttpStatus, isSafeHttpMethod } from '@/lib/retryPolicy';

describe('frontend failure matrix', () => {
  it.each([
    [400, 'VALIDATION_ERROR'], [401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'],
    [404, 'RESOURCE_NOT_FOUND'], [409, 'CONFLICT'], [422, 'UNPROCESSABLE_ENTITY'],
    [429, 'RATE_LIMIT_EXCEEDED'], [503, 'SERVICE_UNAVAILABLE'],
  ])('keeps %s mapped to stable code %s', (statusCode, code) => {
    const parsed = parseApiError({ response: { status: statusCode, data: { code, message: 'server message', requestId: 'req-test' } } });
    expect(parsed.statusCode).toBe(statusCode);
    expect(parsed.code).toBe(code);
    expect(parsed.requestId).toBe('req-test');
  });

  it('does not automatically retry unsafe mutations', () => {
    expect(isSafeHttpMethod('POST')).toBe(false);
    expect(isRetryableHttpStatus(503)).toBe(true);
  });

  it('recognizes transient safe-request failures', () => {
    expect(isSafeHttpMethod('GET')).toBe(true);
    expect(isRetryableHttpStatus(503)).toBe(true);
    expect(isRetryableHttpStatus(400)).toBe(false);
  });
});
