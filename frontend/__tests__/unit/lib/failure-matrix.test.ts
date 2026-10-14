import { describe, expect, it } from 'vitest';
import axios from 'axios';
import { parseApiError } from '@/lib/errorParser';
import { isRetryableHttpStatus, isSafeHttpMethod } from '@/lib/retryPolicy';

function axiosErr(status: number, code: string) {
  return new axios.AxiosError(
    'Request failed',
    String(status),
    undefined,
    undefined,
    {
      status,
      statusText: 'Error',
      headers: {},
      config: {} as any,
      data: { code, message: 'server message', requestId: 'req-test' },
    },
  );
}

describe('frontend failure matrix', () => {
  it.each([
    [400, 'VALIDATION_ERROR'], [401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'],
    [404, 'RESOURCE_NOT_FOUND'], [409, 'CONFLICT'], [422, 'UNPROCESSABLE_ENTITY'],
    [429, 'RATE_LIMIT_EXCEEDED'], [503, 'SERVICE_UNAVAILABLE'],
  ])('keeps %s mapped to stable code %s', (statusCode, code) => {
    const parsed = parseApiError(axiosErr(statusCode as number, code as string));
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
